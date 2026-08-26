/**
 * Build-time knowledge-bundle generator for the in-client AI assistant.
 *
 *   yarn build:assistant-kb   ->   public/assistant-kb.json
 *
 * Everything in the bundle is recovered from the repository sources with the
 * TypeScript compiler API, so it cannot silently drift:
 *
 *  - settings catalog  <- the `Settings` / `UiSettings` interfaces, the default
 *                         objects, and the JSX of the settings panels (labels,
 *                         select options, slider bounds, panel titles)
 *  - schemas           <- verbatim interface source for the shapes the model is
 *                         allowed to propose, plus hand-written worked examples
 *  - command catalog   <- every `{ pattern: /re/, callback }` alias the client
 *                         registers, cross-referenced with the doc tables
 *  - docs              <- the end-user-facing `docs/*.md` pages only
 *
 * The run FAILS LOUDLY (non-zero exit) if any extractor comes back empty or a
 * source shape it depends on has moved. A quiet empty catalog would be worse
 * than a broken build.
 *
 * Hand-maintained gap-fillers live in `scripts/assistant-kb-overrides.json`.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { KB_FORMAT_VERSION, PROPOSAL_KINDS, estimateTokens, projectFat, projectLean, settingProposalKey } from '../src/shared/assistant/knowledgeBundle.ts';
import type {
    CommandEntry,
    DocEntry,
    EventEntry,
    KnowledgeBundle,
    KnowledgeIndex,
    ProposalSchema,
    SchemaCatalog,
    SettingControl,
    SettingEntry,
    SettingOption,
    SettingScope,
} from '../src/shared/assistant/knowledgeBundle.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'public', 'assistant-kb.json');
const OVERRIDES_FILE = path.join(ROOT, 'scripts', 'assistant-kb-overrides.json');

/** Soft budget for the lean projection — reported, not enforced. */
const LEAN_TOKEN_TARGET = 10000;

// ---------------------------------------------------------------------------
// tiny utilities
// ---------------------------------------------------------------------------

function fail(message: string): never {
    throw new Error(`[assistant-kb] ${message}`);
}

function rel(absolute: string): string {
    return path.relative(ROOT, absolute).split(path.sep).join('/');
}

function readFile(absolute: string): string {
    if (!fs.existsSync(absolute)) fail(`missing source file: ${rel(absolute)}`);
    return fs.readFileSync(absolute, 'utf8');
}

const sourceCache = new Map<string, ts.SourceFile>();

function parse(absolute: string): ts.SourceFile {
    const cached = sourceCache.get(absolute);
    if (cached) return cached;
    const text = readFile(absolute);
    const kind = absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, kind);
    sourceCache.set(absolute, sf);
    return sf;
}

/** Collect every descendant node matching a predicate, depth-first. */
function collect<T extends ts.Node>(root: ts.Node, pred: (n: ts.Node) => n is T): T[] {
    const out: T[] = [];
    const visit = (n: ts.Node) => {
        if (pred(n)) out.push(n);
        ts.forEachChild(n, visit);
    };
    visit(root);
    return out;
}

/** First descendant matching a predicate, depth-first. */
function findFirst(root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node | undefined {
    let hit: ts.Node | undefined;
    const visit = (n: ts.Node) => {
        if (hit) return;
        if (pred(n)) { hit = n; return; }
        ts.forEachChild(n, visit);
    };
    visit(root);
    return hit;
}

// ---------------------------------------------------------------------------
// module resolution (path aliases) + static constant evaluation
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string> = {
    '@client': 'src/client',
    '@web': 'src/web',
    '@shared': 'src/shared',
    '@modules': 'src/modules',
    '@web-ui': 'src/ui/web',
};

function resolveModule(specifier: string, fromFile: string): string | undefined {
    let base: string | undefined;
    for (const [alias, target] of Object.entries(ALIASES)) {
        if (specifier === alias || specifier.startsWith(alias + '/')) {
            base = path.join(ROOT, target, specifier.slice(alias.length).replace(/^\//, ''));
            break;
        }
    }
    if (!base && (specifier.startsWith('./') || specifier.startsWith('../'))) {
        base = path.resolve(path.dirname(fromFile), specifier);
    }
    if (!base) return undefined;
    const candidates = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
    for (const c of candidates) {
        if (c.match(/\.tsx?$/) && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return undefined;
}

interface EvalResult { ok: boolean; value?: unknown }

/** Local variable bindings, used when evaluating inside an `Array.map` body. */
type Bindings = Map<string, unknown> | undefined;

const OK = (value: unknown): EvalResult => ({ ok: true, value });
const NO: EvalResult = { ok: false };

/**
 * Evaluate a statically-known expression. Handles literals, arrays, objects,
 * spreads, `as` casts, template strings, `+`, member access and identifiers
 * resolved through the module graph (or through `bindings`). Anything else
 * (function calls, `typeof window` guards, …) returns `ok:false` so the caller
 * can record the raw source text instead of inventing a value.
 */
function evaluate(node: ts.Node, file: string, depth = 0, bindings?: Bindings): EvalResult {
    if (depth > 12) return NO;
    const sub = (n: ts.Node) => evaluate(n, file, depth + 1, bindings);

    if (ts.isParenthesizedExpression(node)) return sub(node.expression);
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return sub(node.expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return OK(node.text);
    if (ts.isNumericLiteral(node)) return OK(Number(node.text));
    if (node.kind === ts.SyntaxKind.TrueKeyword) return OK(true);
    if (node.kind === ts.SyntaxKind.FalseKeyword) return OK(false);
    if (node.kind === ts.SyntaxKind.NullKeyword) return OK(null);
    if (ts.isIdentifier(node) && node.text === 'undefined') return OK(undefined);
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
        const inner = sub(node.operand);
        return inner.ok && typeof inner.value === 'number' ? OK(-inner.value) : NO;
    }
    if (ts.isTemplateExpression(node)) {
        let out = node.head.text;
        for (const span of node.templateSpans) {
            const v = sub(span.expression);
            if (!v.ok || v.value === null || typeof v.value === 'object') return NO;
            out += String(v.value) + span.literal.text;
        }
        return OK(out);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = sub(node.left);
        const right = sub(node.right);
        if (!left.ok || !right.ok) return NO;
        if (typeof left.value === 'number' && typeof right.value === 'number') return OK(left.value + right.value);
        if (typeof left.value === 'string' || typeof right.value === 'string') return OK(String(left.value) + String(right.value));
        return NO;
    }
    if (ts.isArrayLiteralExpression(node)) {
        const out: unknown[] = [];
        for (const el of node.elements) {
            if (ts.isSpreadElement(el)) {
                const spread = sub(el.expression);
                if (!spread.ok || !Array.isArray(spread.value)) return NO;
                out.push(...spread.value);
                continue;
            }
            const v = sub(el);
            if (!v.ok) return NO;
            out.push(v.value);
        }
        return OK(out);
    }
    if (ts.isObjectLiteralExpression(node)) {
        const out: Record<string, unknown> = {};
        for (const prop of node.properties) {
            if (ts.isSpreadAssignment(prop)) {
                const spread = sub(prop.expression);
                if (!spread.ok || typeof spread.value !== 'object' || spread.value === null) return NO;
                Object.assign(out, spread.value);
                continue;
            }
            if (!ts.isPropertyAssignment(prop)) return NO;
            const name = propertyName(prop.name);
            if (name === undefined) return NO;
            const v = sub(prop.initializer);
            if (!v.ok) return NO;
            out[name] = v.value;
        }
        return OK(out);
    }
    if (ts.isPropertyAccessExpression(node)) {
        const target = sub(node.expression);
        if (!target.ok || target.value === null || typeof target.value !== 'object') return NO;
        const key = node.name.text;
        if (!(key in (target.value as Record<string, unknown>))) return NO;
        return OK((target.value as Record<string, unknown>)[key]);
    }
    if (ts.isIdentifier(node)) {
        if (bindings?.has(node.text)) return OK(bindings.get(node.text));
        const resolved = lookupConst(node.text, file);
        if (!resolved) return NO;
        // Module-level constants are evaluated in their own file, without the
        // local bindings of the call site.
        return evaluate(resolved.node, resolved.file, depth + 1, undefined);
    }
    return NO;
}

function propertyName(name: ts.PropertyName): string | undefined {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
    if (ts.isNumericLiteral(name)) return name.text;
    return undefined;
}

/** Find `const NAME = <expr>` in a file, following re-exports/imports. */
function lookupConst(name: string, file: string, seen = new Set<string>()): { node: ts.Node; file: string } | undefined {
    const guard = `${file}#${name}`;
    if (seen.has(guard)) return undefined;
    seen.add(guard);

    const sf = parse(file);
    for (const stmt of sf.statements) {
        if (ts.isVariableStatement(stmt)) {
            for (const decl of stmt.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
                    return { node: decl.initializer, file };
                }
            }
        }
    }
    // Follow the import that brought the name in.
    for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
        const clause = stmt.importClause;
        if (!clause || clause.isTypeOnly) continue;
        const named = clause.namedBindings;
        if (!named || !ts.isNamedImports(named)) continue;
        const match = named.elements.find(e => e.name.text === name);
        if (!match) continue;
        const target = resolveModule(stmt.moduleSpecifier.text, file);
        if (!target) return undefined;
        const original = match.propertyName?.text ?? name;
        return lookupConst(original, target, seen);
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// interface + type-alias extraction
// ---------------------------------------------------------------------------

interface InterfaceProp {
    name: string;
    optional: boolean;
    type: string;
    typeNode: ts.TypeNode | undefined;
}

function findInterface(sf: ts.SourceFile, name: string): ts.InterfaceDeclaration {
    for (const stmt of sf.statements) {
        if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === name) return stmt;
    }
    return fail(`interface \`${name}\` not found in ${rel(sf.fileName)} — the source shape changed`);
}

function interfaceProps(sf: ts.SourceFile, name: string): InterfaceProp[] {
    const decl = findInterface(sf, name);
    const props: InterfaceProp[] = [];
    for (const member of decl.members) {
        if (!ts.isPropertySignature(member) || !member.name) continue;
        const propName = propertyName(member.name);
        if (propName === undefined) continue;
        props.push({
            name: propName,
            optional: !!member.questionToken,
            type: member.type ? member.type.getText(sf).replace(/\s+/g, ' ') : 'unknown',
            typeNode: member.type,
        });
    }
    if (props.length === 0) fail(`interface \`${name}\` in ${rel(sf.fileName)} has no properties`);
    return props;
}

/** Literal-union members of a type alias, e.g. `type X = 'a' | 'b'`. */
function typeAliasUnions(sf: ts.SourceFile): Map<string, (string | number | boolean)[]> {
    const out = new Map<string, (string | number | boolean)[]>();
    for (const stmt of sf.statements) {
        if (!ts.isTypeAliasDeclaration(stmt)) continue;
        const members = unionLiterals(stmt.type);
        if (members) out.set(stmt.name.text, members);
    }
    return out;
}

function unionLiterals(node: ts.TypeNode | undefined): (string | number | boolean)[] | undefined {
    if (!node) return undefined;
    const members: (string | number | boolean)[] = [];
    const take = (t: ts.TypeNode): boolean => {
        if (ts.isParenthesizedTypeNode(t)) return take(t.type);
        if (ts.isLiteralTypeNode(t)) {
            const lit = t.literal;
            if (ts.isStringLiteral(lit)) { members.push(lit.text); return true; }
            if (ts.isNumericLiteral(lit)) { members.push(Number(lit.text)); return true; }
            if (lit.kind === ts.SyntaxKind.TrueKeyword) { members.push(true); return true; }
            if (lit.kind === ts.SyntaxKind.FalseKeyword) { members.push(false); return true; }
        }
        return false;
    };
    if (ts.isUnionTypeNode(node)) {
        for (const t of node.types) {
            if (t.kind === ts.SyntaxKind.UndefinedKeyword) continue;
            if (!take(t)) return undefined;
        }
        return members.length > 1 ? members : undefined;
    }
    return undefined;
}

/** Verbatim source of one or more declarations, for the schema catalog. */
function declarationSource(sf: ts.SourceFile, names: string[]): string {
    const chunks: string[] = [];
    for (const name of names) {
        const decl = sf.statements.find(s =>
            (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name.text === name);
        if (!decl) fail(`declaration \`${name}\` not found in ${rel(sf.fileName)}`);
        chunks.push(sf.text.slice(decl.getStart(sf), decl.getEnd()));
    }
    return chunks.join('\n\n');
}

// ---------------------------------------------------------------------------
// JSX settings-panel extraction
// ---------------------------------------------------------------------------

interface UiControl {
    key: string;
    label?: string;
    id?: string;
    control: SettingControl;
    options?: SettingOption[];
    min?: number;
    max?: number;
    step?: number;
    location: string;
    file: string;
}

const CONTROL_TAGS: Record<string, SettingControl> = {
    CheckboxRow: 'checkbox',
    SelectField: 'select',
    NumberField: 'number',
    RangeField: 'range',
    ColorField: 'color',
    'Form.Check': 'checkbox',
    'Form.Select': 'select',
    'Form.Range': 'range',
    'Form.Control': 'text',
    select: 'select',
    input: 'text',
    textarea: 'text',
};

/** Identifiers whose property access names a settings key. */
const DRAFT_IDENTIFIERS = new Set(['draft', 'settings', 's', 'sharedSettings', 'merged', 'updated']);

type JsxElementLike = ts.JsxElement | ts.JsxSelfClosingElement;

function isJsxElementLike(n: ts.Node): n is JsxElementLike {
    return ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
}

function openingOf(n: JsxElementLike): ts.JsxOpeningElement | ts.JsxSelfClosingElement {
    return ts.isJsxElement(n) ? n.openingElement : n;
}

function tagOf(n: JsxElementLike, sf: ts.SourceFile): string {
    return openingOf(n).tagName.getText(sf);
}

function attrOf(n: JsxElementLike, name: string): ts.JsxAttribute | undefined {
    for (const a of openingOf(n).attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue;
        const attrName = ts.isIdentifier(a.name) ? a.name.text : undefined;
        if (attrName === name) return a;
    }
    return undefined;
}

function stringAttr(n: JsxElementLike, name: string, sf?: ts.SourceFile): string | undefined {
    const attr = attrOf(n, name);
    if (!attr || !attr.initializer) return undefined;
    if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
    if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        const expr = attr.initializer.expression;
        if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
        // `label={<>Tekst <span title="…"><Icon/></span></>}` — take the prose.
        if (sf && (ts.isJsxFragment(expr) || isJsxElementLike(expr))) {
            const text = jsxText(expr, sf);
            return text || undefined;
        }
    }
    return undefined;
}

function numberAttr(n: JsxElementLike, name: string): number | undefined {
    const attr = attrOf(n, name);
    if (!attr || !attr.initializer) return undefined;
    const expr = ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer;
    if (!expr) return undefined;
    if (ts.isNumericLiteral(expr)) return Number(expr.text);
    if (ts.isStringLiteral(expr)) {
        const parsed = Number(expr.text);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expr.operand)) {
        return -Number(expr.operand.text);
    }
    return undefined;
}

/**
 * Plain-text content of a JSX element. `bindings` lets `{label}` inside an
 * `Array.map` body resolve to the concrete array element.
 */
function jsxText(n: ts.Node, sf: ts.SourceFile, bindings?: Bindings): string {
    const parts: string[] = [];
    // Only descend into JSX *children*. Walking whole subtrees would also pick
    // up attribute expressions (`value={i + 1}`, `key={…}`) and splice them
    // into the text.
    const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
            const t = node.text.replace(/\s+/g, ' ').trim();
            if (t) parts.push(t);
            return;
        }
        if (ts.isJsxExpression(node)) {
            if (!node.expression) return;
            const value = evaluate(node.expression, sf.fileName, 0, bindings);
            if (value.ok && value.value !== null && value.value !== undefined && typeof value.value !== 'object') {
                parts.push(String(value.value));
            }
            return; // dynamic content that did not resolve — skip
        }
        if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
            node.children.forEach(visit);
            return;
        }
        // Self-closing elements (icons, inputs) carry no text.
    };
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) n.children.forEach(visit);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** `update({ key: … })` — the key the control writes. */
function updateCallKey(el: JsxElementLike): string | undefined {
    let found: string | undefined;
    const visit = (n: ts.Node) => {
        if (found) return;
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'update') {
            const arg = n.arguments[0];
            if (arg && ts.isObjectLiteralExpression(arg) && arg.properties.length > 0) {
                const prop = arg.properties[0];
                if (ts.isPropertyAssignment(prop)) found = propertyName(prop.name);
                else if (ts.isShorthandPropertyAssignment(prop)) found = prop.name.text;
                if (found) return;
            }
        }
        ts.forEachChild(n, visit);
    };
    ts.forEachChild(openingOf(el).attributes, visit);
    return found;
}

/** `onChangeSetting(s => s.key = …)` — the key the control assigns. */
function assignmentKey(el: JsxElementLike): string | undefined {
    let found: string | undefined;
    const visit = (n: ts.Node) => {
        if (found) return;
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && ts.isPropertyAccessExpression(n.left)
            && ts.isIdentifier(n.left.expression) && DRAFT_IDENTIFIERS.has(n.left.expression.text)) {
            found = n.left.name.text;
            return;
        }
        ts.forEachChild(n, visit);
    };
    ts.forEachChild(openingOf(el).attributes, visit);
    return found;
}

/** `value={draft.key}` / `checked={settings.key}` — the key the control reads. */
function readKey(el: JsxElementLike): string | undefined {
    for (const name of ['checked', 'value']) {
        const attr = attrOf(el, name);
        if (!attr || !attr.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression) continue;
        let found: string | undefined;
        const visit = (n: ts.Node) => {
            if (found) return;
            if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && DRAFT_IDENTIFIERS.has(n.expression.text)) {
                found = n.name.text;
                return;
            }
            ts.forEachChild(n, visit);
        };
        visit(attr.initializer.expression);
        if (found) return found;
    }
    return undefined;
}

function optionValue(n: JsxElementLike, sf: ts.SourceFile, bindings?: Bindings): string | number | boolean | undefined {
    const attr = attrOf(n, 'value');
    if (!attr?.initializer) return undefined;
    const expr = ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer;
    if (!expr) return undefined;
    const value = evaluate(expr, sf.fileName, 0, bindings);
    if (!value.ok) return undefined;
    const v = value.value;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    return undefined;
}

function pushOption(opts: SettingOption[], value: string | number | boolean, label: string): void {
    if (opts.some(o => String(o.value) === String(value))) return;
    opts.push(label ? { value, label } : { value });
}

/**
 * Allowed values of a `<select>`. Handles both literal `<option>` children and
 * the `{ARRAY.map(… => <option …/>)}` form the character-settings panel uses,
 * by resolving the array statically and binding the callback parameters.
 */
function optionsOf(el: JsxElementLike, sf: ts.SourceFile): SettingOption[] | undefined {
    const opts: SettingOption[] = [];

    const visit = (n: ts.Node, bindings: Bindings, group: string) => {
        if (isJsxElementLike(n) && tagOf(n, sf) === 'optgroup') {
            const label = stringAttr(n, 'label', sf);
            ts.forEachChild(n, x => visit(x, bindings, label ? `${label}: ` : group));
            return;
        }
        if (isJsxElementLike(n) && tagOf(n, sf) === 'option') {
            const value = optionValue(n, sf, bindings);
            if (value !== undefined) {
                const text = ts.isJsxElement(n) ? jsxText(n, sf, bindings) : '';
                pushOption(opts, value, text ? group + text : '');
            }
            return;
        }
        // `{items.map((item, i) => <option … />)}`
        if (ts.isCallExpression(n)
            && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'map'
            && n.arguments.length >= 1) {
            const source = evaluate(n.expression.expression, sf.fileName, 0, bindings);
            const cb = n.arguments[0];
            if (source.ok && Array.isArray(source.value)
                && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
                const params = cb.parameters
                    .map(p => (ts.isIdentifier(p.name) ? p.name.text : undefined));
                const optionEl = findFirst(cb.body, x => isJsxElementLike(x) && tagOf(x as JsxElementLike, sf) === 'option');
                if (optionEl) {
                    source.value.forEach((item, i) => {
                        const scoped = new Map<string, unknown>(bindings ?? []);
                        if (params[0]) scoped.set(params[0], item);
                        if (params[1]) scoped.set(params[1], i);
                        const value = optionValue(optionEl as JsxElementLike, sf, scoped);
                        if (value !== undefined) {
                            const text = ts.isJsxElement(optionEl) ? jsxText(optionEl, sf, scoped) : '';
                            pushOption(opts, value, text ? group + text : '');
                        }
                    });
                    return;
                }
            }
        }
        ts.forEachChild(n, x => visit(x, bindings, group));
    };

    ts.forEachChild(el, x => visit(x, undefined, ''));
    return opts.length > 0 ? opts : undefined;
}

function isLabelTag(el: JsxElementLike, sf: ts.SourceFile): boolean {
    const tag = tagOf(el, sf);
    return tag === 'label' || tag === 'Form.Label';
}

function cleanLabel(text: string): string {
    return text.replace(/\s*:\s*$/, '').trim();
}

/** Map of `id` -> label text, from `<label htmlFor="id">` anywhere in the file. */
function labelsById(sf: ts.SourceFile): Map<string, string> {
    const out = new Map<string, string>();
    for (const el of collect(sf, isJsxElementLike)) {
        if (!isLabelTag(el, sf)) continue;
        const htmlFor = stringAttr(el, 'htmlFor', sf);
        if (!htmlFor) continue;
        const text = ts.isJsxElement(el) ? jsxText(el, sf) : '';
        if (!text) continue;
        if (!out.has(htmlFor)) out.set(htmlFor, cleanLabel(text));
    }
    return out;
}

/**
 * Fallback for `<Form.Group><Form.Label>Tekst:</Form.Label><Form.Control …/>`,
 * where the label is a plain sibling with no `htmlFor`: walk up a few levels
 * and take the nearest preceding label inside the same wrapper.
 */
function siblingLabel(el: JsxElementLike, sf: ts.SourceFile): string | undefined {
    let node: ts.Node | undefined = el;
    for (let level = 0; level < 3 && node; level++) {
        const parent: ts.Node | undefined = node.parent;
        if (!parent) return undefined;
        const container = ts.isJsxElement(parent) ? parent : undefined;
        if (container) {
            let best: string | undefined;
            for (const child of container.children) {
                if (child.getStart(sf) >= node.getStart(sf)) break;
                const found = findFirst(child, x => isJsxElementLike(x) && isLabelTag(x as JsxElementLike, sf));
                if (found && ts.isJsxElement(found)) {
                    const text = jsxText(found, sf);
                    if (text) best = cleanLabel(text);
                }
            }
            if (best) return best;
        }
        node = parent;
    }
    return undefined;
}

function sectionTitleOf(el: JsxElementLike, sf: ts.SourceFile): string | undefined {
    const heading = findFirst(el, n =>
        isJsxElementLike(n)
        && /^h[1-6]$/.test(tagOf(n, sf))
        && (stringAttr(n, 'className', sf) ?? '').includes('section-title'));
    if (!heading) return undefined;
    const text = jsxText(heading, sf);
    return text || undefined;
}

/** Walk one settings panel and collect every control bound to a settings key. */
function extractPanel(file: string, basePath: string): UiControl[] {
    const sf = parse(file);
    const labels = labelsById(sf);
    const out: UiControl[] = [];

    const walk = (node: ts.Node, sections: string[]) => {
        let childSections = sections;
        if (isJsxElementLike(node)) {
            const tag = tagOf(node, sf);
            if (tag === 'SettingsSection') {
                const title = stringAttr(node, 'title', sf);
                if (title) childSections = [...sections, title];
            } else if (tag === 'section' && (stringAttr(node, 'className', sf) ?? '').includes('settings-section')) {
                const title = sectionTitleOf(node, sf);
                if (title) childSections = [...sections, title];
            }

            const control = CONTROL_TAGS[tag];
            if (control) {
                const key = updateCallKey(node) ?? assignmentKey(node) ?? readKey(node);
                if (key) {
                    const id = stringAttr(node, 'id', sf);
                    const label = stringAttr(node, 'label', sf)
                        ?? (id ? labels.get(id) : undefined)
                        ?? siblingLabel(node, sf);
                    const entry: UiControl = {
                        key,
                        label,
                        id,
                        control: refineControl(control, node),
                        options: optionsOf(node, sf),
                        min: numberAttr(node, 'min'),
                        max: numberAttr(node, 'max'),
                        step: numberAttr(node, 'step'),
                        location: [basePath, ...sections].join(' → '),
                        file: rel(file),
                    };
                    out.push(entry);
                }
            }
        }
        ts.forEachChild(node, n => walk(n, childSections));
    };

    walk(sf, []);
    return out;
}

/** `<input type="color">` / `type="range"` refine the generic `input` mapping. */
function refineControl(base: SettingControl, el: JsxElementLike): SettingControl {
    const type = stringAttr(el, 'type');
    if (type === 'color') return 'color';
    if (type === 'range') return 'range';
    if (type === 'number') return 'number';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'text' || type === 'url') return 'text';
    return base;
}

// ---------------------------------------------------------------------------
// panel map — the navigation tree a user follows
// ---------------------------------------------------------------------------

interface PanelSpec {
    /** Tab key inside the container component. */
    tab: string;
    /** Human path prefix, e.g. `Ustawienia → Opcje → Ogólne`. */
    label: string;
    /** Files rendering that tab, relative to the repo root. */
    files: string[];
}

const MENU = 'Menu (⋮)';

const CHARACTER_CONTAINER = 'src/web/options/CharacterSettings.tsx';
const UI_CONTAINER = 'src/web/uiSettings/UiSettings.tsx';

const CHARACTER_PANELS: PanelSpec[] = [
    { tab: 'general', label: 'Ogólne', files: ['src/web/options/Settings.tsx'] },
    { tab: 'guild', label: 'Gildie', files: ['src/web/options/GuildsSettings.tsx'] },
    { tab: 'luaGags', label: 'Walka', files: ['src/web/options/LuaGagsSettings.tsx'] },
    { tab: 'enemyBinds', label: 'Bindy wrogów', files: ['src/web/options/EnemyBindsSettings.tsx'] },
    { tab: 'magiki', label: 'Magiki', files: ['src/web/options/MagikiSettings.tsx'] },
];

const UI_PANELS: PanelSpec[] = [
    { tab: 'general', label: 'Ogólne', files: ['src/web/uiSettings/tabs/GeneralTab.tsx', 'src/web/uiSettings/tabs/BehaviourTab.tsx'] },
    { tab: 'footer', label: 'Stopka', files: ['src/web/uiSettings/tabs/FooterTab.tsx'] },
    { tab: 'map', label: 'Mapa', files: ['src/web/uiSettings/tabs/MapTab.tsx'] },
    { tab: 'sound', label: 'Dźwięk', files: ['src/web/uiSettings/tabs/SoundTab.tsx'] },
];

/** Read `type Tab = "a" | "b"` out of a container so a new tab breaks the build. */
function containerTabKeys(file: string): string[] {
    const sf = parse(path.join(ROOT, file));
    for (const stmt of sf.statements) {
        if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === 'Tab') {
            const members = unionLiterals(stmt.type);
            if (members) return members.map(String);
        }
    }
    return fail(`could not read \`type Tab\` from ${file}`);
}

function assertPanelMap(container: string, panels: PanelSpec[]): void {
    const declared = containerTabKeys(container).slice().sort();
    const mapped = panels.map(p => p.tab).slice().sort();
    if (declared.join('|') !== mapped.join('|')) {
        fail(`tab list in ${container} is [${declared}] but the panel map has [${mapped}] — update CHARACTER_PANELS/UI_PANELS`);
    }
    for (const p of panels) {
        for (const f of p.files) {
            if (!fs.existsSync(path.join(ROOT, f))) fail(`panel file ${f} no longer exists`);
        }
    }
}

// ---------------------------------------------------------------------------
// settings catalog
// ---------------------------------------------------------------------------

interface SliceSpec {
    scope: SettingScope;
    /** Interface name holding the field declarations. */
    interfaceName: string;
    /** File that declares the interface. */
    typesFile: string;
    /** localStorage key the object is persisted under. */
    storageKey: string;
    /** Const holding the defaults, and the file it lives in. */
    defaultsConst: string;
    defaultsFile: string;
    /** Optional key-list const used as a cross-check. */
    keyListConst?: string;
    keyListFile?: string;
}

const UI_TYPES = 'src/shared/uiSettingsTypes.ts';
const SHARED_DEFAULTS = 'src/shared/settingsDefaults.ts';

const SLICES: SliceSpec[] = [
    {
        scope: 'character', interfaceName: 'Settings', typesFile: 'src/modules/core/defaultSettings.ts',
        storageKey: 'settings', defaultsConst: 'defaultSettings', defaultsFile: 'src/modules/core/defaultSettings.ts',
    },
    {
        scope: 'ui', interfaceName: 'ShellSettings', typesFile: UI_TYPES, storageKey: 'shellSettings',
        defaultsConst: 'defaultShellSettings', defaultsFile: SHARED_DEFAULTS,
        keyListConst: 'shellSettingsKeys', keyListFile: SHARED_DEFAULTS,
    },
    {
        scope: 'ui', interfaceName: 'RenderSettings', typesFile: UI_TYPES, storageKey: 'renderSettings',
        defaultsConst: 'defaultRenderSettings', defaultsFile: SHARED_DEFAULTS,
        keyListConst: 'renderSettingsKeys', keyListFile: SHARED_DEFAULTS,
    },
    {
        scope: 'ui', interfaceName: 'MapSettings', typesFile: UI_TYPES, storageKey: 'mapSettings',
        defaultsConst: 'defaultMapSettings', defaultsFile: SHARED_DEFAULTS,
        keyListConst: 'mapSettingsKeys', keyListFile: SHARED_DEFAULTS,
    },
    {
        scope: 'ui', interfaceName: 'BehaviorSettings', typesFile: UI_TYPES, storageKey: 'behaviorSettings',
        defaultsConst: 'defaultBehaviorSettings', defaultsFile: SHARED_DEFAULTS,
        keyListConst: 'behaviorSettingsKeys', keyListFile: SHARED_DEFAULTS,
    },
    {
        scope: 'ui', interfaceName: 'DeviceViewSettings', typesFile: UI_TYPES, storageKey: 'uiSettings',
        defaultsConst: 'defaultDeviceViewSettings', defaultsFile: SHARED_DEFAULTS,
        keyListConst: 'deviceViewSettingsKeys', keyListFile: SHARED_DEFAULTS,
    },
    {
        scope: 'ui', interfaceName: 'ChromeSettings', typesFile: UI_TYPES, storageKey: 'uiSettings',
        defaultsConst: 'defaultChromeSettings', defaultsFile: 'src/web/defaultUiSettings.ts',
    },
];

interface Overrides {
    settings?: Record<string, { label?: string; uiLocation?: string; note?: string; default?: unknown; control?: SettingControl }>;
    commands?: Record<string, { description?: string; usage?: string }>;
    ignoreSettings?: string[];
}

function loadOverrides(): Overrides {
    if (!fs.existsSync(OVERRIDES_FILE)) return {};
    return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) as Overrides;
}

function buildSettings(overrides: Overrides): { entries: SettingEntry[]; panelLines: string[]; gaps: string[] } {
    assertPanelMap(CHARACTER_CONTAINER, CHARACTER_PANELS);
    assertPanelMap(UI_CONTAINER, UI_PANELS);

    // --- UI controls, keyed by settings key -> first control that writes it.
    const controls = new Map<string, UiControl>();
    const panelLines: string[] = [];

    const runPanels = (rootLabel: string, panels: PanelSpec[]) => {
        for (const panel of panels) {
            const base = `${rootLabel} → ${panel.label}`;
            const sections = new Set<string>();
            let count = 0;
            for (const file of panel.files) {
                for (const c of extractPanel(path.join(ROOT, file), base)) {
                    count++;
                    sections.add(c.location);
                    if (!controls.has(c.key)) controls.set(c.key, c);
                }
            }
            const sectionList = [...sections].map(s => s.slice(base.length + 3)).filter(Boolean);
            panelLines.push(`${base} — ${count} ustawien${sectionList.length ? `; sekcje: ${sectionList.join(', ')}` : ''}`);
        }
    };

    runPanels(`${MENU} → Ustawienia (Opcje)`, CHARACTER_PANELS);
    runPanels(`${MENU} → Interfejs (Ustawienia UI)`, UI_PANELS);

    if (controls.size < 40) {
        fail(`only ${controls.size} settings controls recovered from the JSX panels — extraction is broken`);
    }

    // --- Type + default per slice.
    const entries: SettingEntry[] = [];
    const gaps: string[] = [];
    const ignore = new Set(overrides.ignoreSettings ?? []);

    for (const slice of SLICES) {
        const typesSf = parse(path.join(ROOT, slice.typesFile));
        const aliasUnions = typeAliasUnions(typesSf);
        const props = interfaceProps(typesSf, slice.interfaceName);

        const defaultsFile = path.join(ROOT, slice.defaultsFile);
        const defaultsDecl = lookupConst(slice.defaultsConst, defaultsFile);
        if (!defaultsDecl) fail(`const \`${slice.defaultsConst}\` not found in ${slice.defaultsFile}`);
        const defaultsObject = defaultsDecl.node;
        if (!ts.isObjectLiteralExpression(defaultsObject)) {
            fail(`\`${slice.defaultsConst}\` in ${slice.defaultsFile} is not an object literal`);
        }
        const defaultsByKey = new Map<string, ts.Expression>();
        const spreadDefaults: Record<string, unknown> = {};
        for (const prop of defaultsObject.properties) {
            if (ts.isSpreadAssignment(prop)) {
                const spread = evaluate(prop.expression, defaultsDecl.file);
                if (spread.ok && spread.value && typeof spread.value === 'object') {
                    Object.assign(spreadDefaults, spread.value);
                }
                continue;
            }
            if (!ts.isPropertyAssignment(prop)) continue;
            const name = propertyName(prop.name);
            if (name !== undefined) defaultsByKey.set(name, prop.initializer);
        }

        // Cross-check the slice against its explicit key list, when it has one.
        if (slice.keyListConst && slice.keyListFile) {
            const listDecl = lookupConst(slice.keyListConst, path.join(ROOT, slice.keyListFile));
            if (!listDecl) fail(`const \`${slice.keyListConst}\` not found in ${slice.keyListFile}`);
            const listed = evaluate(listDecl.node, listDecl.file);
            if (!listed.ok || !Array.isArray(listed.value)) fail(`\`${slice.keyListConst}\` is not a static array`);
            const listedKeys = new Set((listed.value as string[]).map(String));
            const missing = props.map(p => p.name).filter(n => !listedKeys.has(n));
            if (missing.length > 0) {
                fail(`${slice.interfaceName} declares [${missing}] but ${slice.keyListConst} does not list them`);
            }
        }

        for (const prop of props) {
            const path_ = `${slice.scope}.${slice.storageKey}.${prop.name}`;
            if (ignore.has(path_)) continue;

            const override = overrides.settings?.[path_];

            let defaultValue: unknown = null;
            let defaultExpression: string | undefined;
            const initializer = defaultsByKey.get(prop.name);
            if (initializer) {
                const evaluated = evaluate(initializer, defaultsDecl.file);
                if (evaluated.ok) {
                    defaultValue = evaluated.value === undefined ? null : evaluated.value;
                } else {
                    defaultExpression = initializer.getText(parse(defaultsDecl.file)).replace(/\s+/g, ' ');
                    if (override?.default === undefined) {
                        gaps.push(`${path_}: default is not a static literal (${defaultExpression}) — set one in ${rel(OVERRIDES_FILE)}`);
                    }
                }
            } else if (prop.name in spreadDefaults) {
                defaultValue = spreadDefaults[prop.name] ?? null;
            } else if (!prop.optional && override?.default === undefined) {
                gaps.push(`${path_}: no default found in ${slice.defaultsConst}`);
            }

            // Allowed values: inline literal union, aliased union, or select options.
            const control = controls.get(prop.name);
            let options: SettingOption[] | undefined;
            const inline = unionLiterals(prop.typeNode);
            const aliasName = prop.typeNode && ts.isTypeReferenceNode(prop.typeNode)
                ? prop.typeNode.typeName.getText(typesSf) : undefined;
            const aliased = aliasName ? aliasUnions.get(aliasName) : undefined;
            const literalValues = inline ?? aliased;
            if (literalValues) {
                options = literalValues.map(value => {
                    const fromUi = control?.options?.find(o => String(o.value) === String(value));
                    return fromUi?.label ? { value, label: fromUi.label } : { value };
                });
            } else if (control?.options) {
                options = control.options;
            }

            const sources = [...new Set([
                slice.typesFile,
                slice.defaultsFile,
                ...(control ? [control.file] : []),
                ...(override ? [rel(OVERRIDES_FILE)] : []),
            ])];

            const entry: SettingEntry = {
                path: path_,
                scope: slice.scope,
                storageKey: slice.storageKey,
                key: prop.name,
                type: prop.type,
                optional: prop.optional,
                default: override?.default !== undefined ? override.default : defaultValue,
                control: override?.control ?? control?.control ?? 'unknown',
                exposedInUi: !!control,
                sources,
            };
            if (defaultExpression) entry.defaultExpression = defaultExpression;
            if (options) entry.options = options;
            if (control?.min !== undefined) entry.min = control.min;
            if (control?.max !== undefined) entry.max = control.max;
            if (control?.step !== undefined) entry.step = control.step;
            const label = override?.label ?? control?.label;
            if (label) entry.label = label;
            const uiLocation = override?.uiLocation ?? control?.location;
            if (uiLocation) entry.uiLocation = uiLocation;
            if (override?.note) entry.note = override.note;
            if (!label) gaps.push(`${path_}: no Polish label recovered — add one to ${rel(OVERRIDES_FILE)}`);

            entries.push(entry);
        }
    }

    if (entries.length < 80) fail(`settings catalog has only ${entries.length} entries — extraction is broken`);
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return { entries, panelLines, gaps };
}

// ---------------------------------------------------------------------------
// command / alias catalog
// ---------------------------------------------------------------------------

/** Files whose alias objects are machinery, not user commands. */
const ALIAS_FILE_DENYLIST = new Set(['src/client/scripts/userAliases.ts']);

function listClientSources(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) { walk(full); continue; }
            if (full.endsWith('.ts') && !full.endsWith('.d.ts')) out.push(full);
        }
    };
    walk(path.join(ROOT, 'src', 'client'));
    return out.sort();
}

/**
 * Decode the literal prefix of a regex source into plain text, and note where
 * the literal run stopped so the caller can look at what follows.
 */
function literalPrefix(source: string): { text: string; end: number } {
    let body = source;
    const offset = body.startsWith('^') ? 1 : 0;
    body = body.slice(offset);
    const out: string[] = [];
    let i = 0;
    for (; i < body.length; i++) {
        const ch = body[i];
        if (ch === '?' || ch === '*') {
            // The preceding literal is optional (`\/?wem`) — drop it.
            out.pop();
            continue;
        }
        if (ch === '\\') {
            const next = body[i + 1];
            if (next && /[/.\-+*?()[\]{}|^$\\]/.test(next)) { out.push(next); i++; continue; }
            break; // \s, \d, \w … — end of the literal run
        }
        if ('([{|+.$'.includes(ch)) break;
        out.push(ch);
    }
    return { text: out.join(''), end: offset + i };
}

/**
 * Human-facing name(s) for an alias regex. A leading alternation of plain words
 * (`/^\/(naprawa|napraw)$/`) expands into one name per alternative.
 */
function commandNames(body: string): string[] {
    const { text, end } = literalPrefix(body);
    let suffixes = [''];
    if (body[end] === '(') {
        const close = body.indexOf(')', end);
        if (close !== -1) {
            const inner = body.slice(end + 1, close).replace(/^\?:/, '');
            if (/^[\w|-]+$/.test(inner) && inner.includes('|')) suffixes = inner.split('|');
        }
    }
    return [...new Set(
        suffixes
            .map(s => (text + s).trim().split(/\s+/)[0])
            .filter(Boolean),
    )];
}

/** Best-effort human signature; `pattern` stays authoritative. */
function usageFromPattern(source: string): string {
    let body = source;
    if (body.startsWith('^')) body = body.slice(1);
    if (body.endsWith('$')) body = body.slice(0, -1);
    let out = '';
    let depth = 0;
    let argIndex = 0;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === '\\') {
            const next = body[i + 1];
            if (next === 's') { if (depth === 0) out += ' '; i += 2 <= body.length ? 1 : 0; if (body[i + 1] === '+' || body[i + 1] === '*') i++; continue; }
            if (next && depth === 0) out += next;
            i++;
            continue;
        }
        if (ch === '(') { depth++; if (depth === 1) { argIndex++; out += `<arg${argIndex}>`; } continue; }
        if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
        if (depth > 0) continue;
        if ('?*+'.includes(ch)) continue;
        if (ch === '[') { let j = i; while (j < body.length && body[j] !== ']') j++; i = j; argIndex++; out += `<arg${argIndex}>`; continue; }
        out += ch;
    }
    return out.replace(/\s+/g, ' ').trim();
}

function buildCommands(docs: DocEntry[], overrides: Overrides): CommandEntry[] {
    // Descriptions from the markdown tables in the user docs.
    const docDescriptions = new Map<string, { description: string; usage: string; doc: string }>();
    for (const doc of docs) {
        for (const line of doc.content.split('\n')) {
            const m = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
            if (!m) continue;
            const [, cell, description] = m;
            if (/^[-: ]+$/.test(cell) || /^Komenda$/i.test(cell.trim())) continue;
            const tokens = [...cell.matchAll(/`([^`]+)`/g)].map(x => x[1]);
            for (const token of tokens) {
                const head = token.trim().split(/\s+/)[0];
                if (!head) continue;
                if (!docDescriptions.has(head)) {
                    docDescriptions.set(head, { description, usage: token.trim(), doc: doc.id });
                }
            }
        }
    }

    const seen = new Set<string>();
    const commands: CommandEntry[] = [];

    for (const file of listClientSources()) {
        if (ALIAS_FILE_DENYLIST.has(rel(file))) continue;
        const sf = parse(file);
        for (const obj of collect(sf, ts.isObjectLiteralExpression)) {
            let patternNode: ts.Expression | undefined;
            let hasCallback = false;
            for (const prop of obj.properties) {
                if (!ts.isPropertyAssignment(prop)) continue;
                const name = propertyName(prop.name);
                if (name === 'pattern') patternNode = prop.initializer;
                if (name === 'callback') hasCallback = true;
            }
            if (!patternNode || !hasCallback) continue;
            if (!ts.isRegularExpressionLiteral(patternNode)) continue;

            const raw = patternNode.text; // e.g. /^\/czas$/i
            const closing = raw.lastIndexOf('/');
            const body = raw.slice(1, closing);
            const key = `${body}`;
            if (seen.has(key)) continue;
            seen.add(key);

            for (const name of commandNames(body)) {
                const doc = docDescriptions.get(name);
                const override = overrides.commands?.[name];
                const entry: CommandEntry = {
                    name,
                    pattern: raw,
                    source: rel(file),
                };
                const usage = override?.usage ?? doc?.usage ?? usageFromPattern(body);
                if (usage) entry.usage = usage;
                const description = override?.description ?? doc?.description;
                if (description) entry.description = description;
                if (doc && !override?.description) entry.documentedIn = doc.doc;
                commands.push(entry);
            }
        }
    }

    if (commands.length < 50) fail(`only ${commands.length} client aliases found — extraction is broken`);
    commands.sort((a, b) => a.name.localeCompare(b.name) || a.pattern.localeCompare(b.pattern));
    return commands;
}

// ---------------------------------------------------------------------------
// docs
// ---------------------------------------------------------------------------

/**
 * End-user documentation only. Developer/contributor pages are deliberately
 * excluded: the assistant talks to players, not to people patching the client.
 */
const USER_DOCS = [
    'docs/OVERVIEW.md',
    'docs/NAVIGATION.md',
    'docs/COMBAT.md',
    'docs/INVENTORY.md',
    'docs/HERBS.md',
    'docs/TRACKING.md',
    'docs/BINDS.md',
    'docs/SHORTCUTS.md',
    'docs/ALIASES.md',
    'docs/SKRYPTY.md',
    'docs/SYNCHRONIZACJA.md',
    'public/llms.txt',
];

/**
 * Excluded on purpose — keep this list next to the include list so the reason
 * survives. `PLUGINS.md` and `AUDIO_SYSTEM.md` are plugin-authoring / internal
 * code-path docs; the rest are architecture and test notes.
 */
const DEV_DOCS = [
    'docs/PLUGINS.md',
    'docs/AUDIO_SYSTEM.md',
    'docs/CLIENT_UI_DECOUPLING.md',
    'docs/SCRIPT_TESTING.md',
    'docs/architecture-analysis.md',
];

function buildDocs(): DocEntry[] {
    // Guard against a new doc silently going missing from both lists.
    const known = new Set([...USER_DOCS, ...DEV_DOCS].map(p => path.basename(p)));
    for (const name of fs.readdirSync(path.join(ROOT, 'docs'))) {
        if (!name.endsWith('.md')) continue;
        if (!known.has(name)) {
            fail(`docs/${name} is new — classify it in USER_DOCS or DEV_DOCS in ${rel(OUT_FILE).replace('public/assistant-kb.json', 'scripts/build-assistant-kb.ts')}`);
        }
    }

    const docs: DocEntry[] = [];
    for (const relPath of USER_DOCS) {
        const abs = path.join(ROOT, relPath);
        const content = readFile(abs).replace(/\r\n/g, '\n').trim();
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const headings = [...content.matchAll(/^#{2,3}\s+(.+)$/gm)].map(m => m[1].trim());
        docs.push({
            id: path.basename(relPath),
            path: relPath,
            title: titleMatch ? titleMatch[1].trim() : path.basename(relPath),
            headings,
            tokens: estimateTokens(content),
            content,
        });
    }
    if (docs.length === 0) fail('no user docs collected');
    return docs;
}

// ---------------------------------------------------------------------------
// proposal schemas
// ---------------------------------------------------------------------------

function buildSchemas(): { schemas: SchemaCatalog; events: EventEntry[]; macroTypes: string[] } {
    const aliasSf = parse(path.join(ROOT, 'src/client/scripts/userAliases.ts'));
    const triggerSf = parse(path.join(ROOT, 'src/client/scripts/userTriggers.ts'));
    const keymapSf = parse(path.join(ROOT, 'src/modules/core/keymapTypes.ts'));

    // SUPPORTED_EVENTS, verbatim.
    const eventsDecl = lookupConst('SUPPORTED_EVENTS', path.join(ROOT, 'src/client/scripts/userTriggers.ts'));
    if (!eventsDecl) fail('SUPPORTED_EVENTS not found in src/client/scripts/userTriggers.ts');
    const eventsValue = evaluate(eventsDecl.node, eventsDecl.file);
    if (!eventsValue.ok || !Array.isArray(eventsValue.value) || eventsValue.value.length === 0) {
        fail('SUPPORTED_EVENTS is not a statically-evaluable array');
    }
    const events = eventsValue.value as EventEntry[];

    // Built-in macro types, from the `BuiltInMacroType` union.
    const macroTypes = (() => {
        for (const stmt of triggerSf.statements) {
            if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === 'BuiltInMacroType') {
                const members = unionLiterals(stmt.type);
                if (members) return members.map(String);
            }
        }
        return fail('BuiltInMacroType union not found in userTriggers.ts');
    })();

    const aliasProps = interfaceProps(aliasSf, 'UserAlias');
    const triggerProps = interfaceProps(triggerSf, 'UserTrigger');
    const macroProps = interfaceProps(triggerSf, 'UserMacro');
    const bindProps = [
        ...interfaceProps(keymapSf, 'Bind'),
        ...interfaceProps(keymapSf, 'CustomBind'),
    ];
    // Slot names a bind can be assigned to — recovered so a renamed slot shows up.
    const bindSlots = interfaceProps(keymapSf, 'BindSettings').map(p => p.name);
    const directionSlots = interfaceProps(keymapSf, 'DirectionBinds').map(p => p.name);

    const toFields = (props: InterfaceProp[], notes: Record<string, string> = {}) =>
        props.map(p => {
            const field: { name: string; type: string; required: boolean; note?: string } = {
                name: p.name, type: p.type, required: !p.optional,
            };
            if (notes[p.name]) field.note = notes[p.name];
            return field;
        });

    const alias: ProposalSchema = {
        name: 'UserAlias',
        description: 'Alias uzytkownika: wzorzec wpisywany w linii komend zamieniany na komende (lub kilka komend) wysylana do gry. Przechowywany w localStorage pod kluczem `aliases` jako tablica UserAlias[].',
        typescript: declarationSource(aliasSf, ['UserAlias']),
        fields: toFields(aliasProps, {
            pattern: 'Wyrazenie regularne BEZ ^ i $ — klient sam opakowuje je w new RegExp("^" + pattern + "$"), wiec wzorzec musi pasowac do CALEJ wpisanej linii. Grupy () sa dostepne w komendzie jako $1, $2, …',
            command: 'Komenda wysylana do gry. Nowa linia (\\n) dziala jak srednik — kolejna komenda. `$i` powtarza komende dla zakresu liczb podanego w argumencie (np. `1-7`), maksymalnie 50 iteracji.',
            overrides: 'Opcjonalna mapa `nazwaPostaci -> komenda`; nadpisuje `command` dla konkretnej postaci (klucz malymi literami, tak jak zapisana nazwa postaci).',
        }),
        examples: [
            {
                description: 'Proste skrocenie: `zz` wysyla `zabierz wszystko z zwloki`.',
                value: { pattern: 'zz', command: 'zabierz wszystko z zwloki' },
            },
            {
                description: 'Alias z argumentem: `kop gobl` -> `dobadz miecz` + `zaatakuj gobl`.',
                value: { pattern: 'kop (.+)', command: 'dobadz miecz\nzaatakuj $1' },
            },
            {
                description: 'Alias z zakresem: `kok 1-7` rozrywa kokony od 1 do 7.',
                value: { pattern: 'kok (.+)', command: 'rozerwij $i. kokon' },
            },
            {
                description: 'Alias z nadpisaniem dla jednej postaci.',
                value: { pattern: 'lecz', command: 'wypij eliksir', overrides: { zaruthi: 'rzuc leczenie na siebie' } },
            },
        ],
        rules: [
            'NIE dodawaj ^ ani $ do `pattern` — klient robi to sam.',
            'W `pattern` uzywaj wylacznie znakow ASCII (bez polskich liter) — tak jak w calym kliencie.',
            '`command` nie moze byc puste.',
            'Odwolania $1..$9 musza miec odpowiadajace grupy w `pattern`.',
            '`$i` dziala tylko wtedy, gdy ktoras z grup dopasowania ma format `X` lub `X-Y` (liczby).',
        ],
    };

    const userMacro: ProposalSchema = {
        name: 'UserMacro',
        description: 'Pojedyncza akcja wykonywana przez trigger uzytkownika. Trigger ma tablice `macros` wykonywanych po kolei.',
        typescript: declarationSource(triggerSf, ['BuiltInMacroType', 'UserMacro']),
        fields: toFields(macroProps, {
            type: `Jeden z: ${macroTypes.join(', ')}. Wartosci zaczynajace sie od "plugin:" to makra z pluginow.`,
            color: 'Kolor dla type="color", np. "#ff0000".',
            to: 'Tekst zastepujacy dopasowanie dla type="replace".',
            command: 'Komenda do gry dla type="command" oraz type="functionalBind".',
            soundKey: 'Klucz dzwieku dla type="beep"; pominiety = "beep".',
            label: 'Etykieta bindu funkcyjnego — wymagana razem z `command` dla type="functionalBind".',
            message: 'Tresc powiadomienia dla type="notify"; puste = dopasowany tekst (tylko triggery wzorcowe).',
            wrapScope: '"match" (domyslnie) otacza dopasowanie, "line" otacza cala linie.',
        }),
        examples: [
            { description: 'Podswietl dopasowanie na czerwono.', value: { type: 'color', color: '#ff0000' } },
            { description: 'Zagraj dzwiek.', value: { type: 'beep', soundKey: 'beep' } },
            { description: 'Wyslij komende do gry.', value: { type: 'command', command: 'dobadz miecz' } },
            { description: 'Zamien tekst.', value: { type: 'replace', to: 'UWAGA' } },
            { description: 'Powiadomienie systemowe.', value: { type: 'notify', message: 'Lampa zaraz zgasnie!' } },
            { description: 'Otocz dopasowanie znacznikami.', value: { type: 'wrap', wrapPrefix: '>>> ', wrapSuffix: ' <<<', wrapScope: 'match' } },
            { description: 'Bind funkcyjny pod glownym klawiszem.', value: { type: 'functionalBind', label: 'podnies', command: 'podnies wszystko' } },
        ],
        rules: [
            'Makra typu "color", "replace", "uppercase", "wrap", "dim", "slowBlink", "rapidBlink" dzialaja WYLACZNIE w triggerach wzorcowych (type="pattern") — triggery zdarzeniowe nie maja tekstu linii.',
            'Triggery zdarzeniowe obsluguja tylko: beep, mute, unmute, command, functionalBind, notify.',
            'type="functionalBind" wymaga JEDNOCZESNIE `label` i `command`.',
            'Makra pluginow ("plugin:...") nie dzialaja w triggerach zdarzeniowych.',
        ],
    };

    const trigger: ProposalSchema = {
        name: 'UserTrigger',
        description: 'Trigger uzytkownika. Przechowywany w localStorage pod kluczem `triggers` jako tablica UserTrigger[]. Dwa rodzaje: wzorcowy (dopasowuje tekst z gry) i zdarzeniowy (reaguje na zdarzenie klienta).',
        typescript: declarationSource(triggerSf, ['TriggerType', 'UserTrigger', 'SupportedEvent']),
        fields: toFields(triggerProps, {
            type: '"pattern" (domyslne, gdy pominiete) albo "event".',
            pattern: 'Wyrazenie regularne dopasowywane do linii z gry. W przeciwienstwie do aliasow NIE jest kotwiczone — dopasowanie czesciowe wystarczy.',
            event: `Identyfikator zdarzenia — tylko z listy SUPPORTED_EVENTS: ${events.map(e => e.id).join(', ')}.`,
            flags: 'Podzbior "gim": g = wszystkie dopasowania w linii, i = ignoruj wielkosc liter, m = trigger wieloliniowy.',
            gmcpMsgType: 'Ogranicza trigger do konkretnego typu wiadomosci GMCP.',
            macros: 'Lista akcji do wykonania (UserMacro[]).',
        }),
        examples: [
            {
                description: 'Podswietl na czerwono kazda wzmianke o trollu i zagraj dzwiek.',
                value: { type: 'pattern', pattern: 'troll', flags: 'gi', macros: [{ type: 'color', color: '#ff0000' }, { type: 'beep' }] },
            },
            {
                description: 'Gdy ktos wchodzi do lokacji, powiadom.',
                value: { type: 'pattern', pattern: 'przybywa z (\\w+)', macros: [{ type: 'notify', message: 'Ktos nadchodzi' }] },
            },
            {
                description: 'Zdarzeniowy: po zakonczeniu walki wyslij komende.',
                value: { type: 'event', event: 'combatState:false', macros: [{ type: 'command', command: 'zbierz wszystko' }] },
            },
            {
                description: 'Zdarzeniowy: dzwiek po ogluszeniu wroga.',
                value: { type: 'event', event: 'enemy.paralyzed', macros: [{ type: 'beep', soundKey: 'beep' }] },
            },
        ],
        rules: [
            'Dokladnie jedno z `pattern` / `event` musi byc ustawione, zgodnie z `type`.',
            '`macros` nie moze byc puste.',
            'W `pattern` nie uzywaj polskich liter — wzorce w tym kliencie sa ASCII (np. "zolw" zamiast "żółw"); zamiast tego dopasuj fragment bez ogonkow albo uzyj klasy [a-z].',
            'W JSON backslash trzeba escapowac: regex \\d zapisujesz jako "\\\\d".',
            '`flags` przyjmuje tylko litery g, i, m.',
            '`event` musi byc dokladnie jednym z identyfikatorow SUPPORTED_EVENTS.',
        ],
    };

    const bind: ProposalSchema = {
        name: 'Bind',
        description: 'Bindy klawiszy. `binds` w localStorage trzyma aktywny zestaw (BindSettings); pelna kolekcja zestawow siedzi w `keymaps` (KeymapStore), a wybrany zestaw per urzadzenie w `arkadia.activeKeymap`. Do proponowania zmian uzywaj pojedynczego Bind albo CustomBind.',
        typescript: declarationSource(keymapSf, ['Bind', 'CustomBind', 'DirectionBinds', 'BindSettings', 'Keymap', 'KeymapStore']),
        fields: toFields(bindProps, {
            key: 'KeyboardEvent.code, np. "KeyA", "Numpad5", "F1", "ArrowUp".',
            ctrl: 'Pominiete = modyfikator NIE moze byc wcisniety.',
            alt: 'Pominiete = modyfikator NIE moze byc wcisniety.',
            shift: 'Pominiete = modyfikator NIE moze byc wcisniety.',
            command: 'Tylko CustomBind: komenda wysylana do gry po wcisnieciu skrotu.',
        }),
        // Every example is a CustomBind: a proposal without `command` would be a
        // request to rebind a built-in slot, which is not something the assistant
        // can express — `validateBind` rejects it as an empty command.
        examples: [
            {
                description: 'Alt+D dobywa bron.',
                value: { key: 'KeyD', alt: true, command: 'dobadz bron' },
            },
            {
                description: 'Klawisz numeryczny 5 rozglada sie po lokacji (bez modyfikatorow).',
                value: { key: 'Numpad5', command: 'rozejrzyj sie' },
            },
            {
                description: 'Ctrl+Shift+A zbiera lupy ze zwlok.',
                value: { key: 'KeyA', ctrl: true, shift: true, command: 'zabierz wszystko z zwloki' },
            },
        ],
        rules: [
            '`key` to KeyboardEvent.code (np. "KeyA", "Numpad5", "F1", "ArrowUp") — nie znak.',
            'Propozycja bindu ZAWSZE zawiera `command` — to CustomBind dopisywany do tablicy `binds.custom`. Bez `command` klient ja odrzuci.',
            'Modyfikator pominiety oznacza "nie moze byc wcisniety" — podawaj tylko te, ktore maja byc trzymane.',
            `Sloty wbudowane w BindSettings: ${bindSlots.join(', ')}; kierunki w \`directions\`: ${directionSlots.join(', ')}.`,
            'Bindy edytuje sie w: Menu (⋮) → Bindowanie.',
        ],
    };

    // The field is `key`, not `path`, because `SettingChangeProposal` in
    // `src/modules/core/assistant/proposalValidator.ts` reads `input.key` — and
    // that validator is what actually gates the write to the user's storage.
    // The accepted key form is the registry's `<storageKey>.<field>`; the
    // catalog's own `path` carries an extra `character.`/`ui.` prefix that
    // `lookupSetting` does not recognise. See `settingProposalKey`.
    const settingChange: ProposalSchema = {
        name: 'SettingChange',
        description: 'Propozycja zmiany ustawienia. `key` musi pochodzic z katalogu ustawien w tym pakiecie (format `<magazyn>.<pole>`, np. "renderSettings.colorTheme"); `value` musi pasowac typem i (jesli sa) nalezec do `options`.',
        typescript: [
            'interface SettingChange {',
            '    /** Klucz z katalogu ustawien: "<magazyn>.<pole>", np. "renderSettings.colorTheme". */',
            '    key: string;',
            '    /** Nowa wartosc — typ zgodny z polem `type` wpisu katalogu. */',
            '    value: unknown;',
            '}',
        ].join('\n'),
        fields: [
            { name: 'key', type: 'string', required: true, note: 'Skladaj z naglowka grupy "## <magazyn>.*" i nazwy pola, np. "settings.shortenExits". NIE dopisuj przedrostka "character." ani "ui." — klient ich nie rozpoznaje.' },
            { name: 'value', type: 'unknown', required: true, note: 'Musi byc jedna z `options`, jesli wpis je ma; dla liczb musi miescic sie w `min`/`max`.' },
        ],
        examples: [
            { description: 'Wlacz skrocone wyjscia.', value: { key: 'settings.shortenExits', value: true } },
            { description: 'Zmien motyw kolorystyczny na lesny.', value: { key: 'renderSettings.colorTheme', value: 'forest' } },
            { description: 'Zwieksz bufor okna wyjscia.', value: { key: 'uiSettings.outputMaxElements', value: 5000 } },
        ],
        rules: [
            '`key` to "<magazyn>.<pole>" — dokladnie tak, jak sklada sie je z indeksu ustawien. Bez przedrostka "character." / "ui.".',
            'Ustawienia oznaczone "(character)" dzialaja tylko po wybraniu postaci.',
            'Nigdy nie zapisuj zmian samodzielnie — zawsze zwroc propozycje do zatwierdzenia przez uzytkownika.',
            'Jesli uzytkownik prosi o cos, czego nie ma w katalogu — powiedz to wprost, nie zmyslaj klucza.',
        ],
    };

    return {
        schemas: { alias, trigger, userMacro, bind, settingChange },
        events,
        macroTypes,
    };
}

// ---------------------------------------------------------------------------
// index (lean projection payload)
// ---------------------------------------------------------------------------

function compactValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value === '' ? '""' : value;
    if (Array.isArray(value)) return value.length === 0 ? '[]' : JSON.stringify(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

const INDEX_FORMAT = [
    'To jest skrocony indeks wiedzy o kliencie Arkadii. Pelne dokumenty sa dostepne osobno.',
    '"panels": legenda lokalizacji w UI — "P<n> = <sciezka nawigacji>". Podajac uzytkownikowi droge, rozwin P<n> do pelnej sciezki.',
    '"settings": linia "## <magazyn>.* (<zasieg>)" otwiera grupe; kolejne linie to "<key> | <etykieta PL> | P<n> | <typ albo enum: a|b|c> | <wartosc domyslna>".',
    '   Klucz ustawienia = prefiks grupy z "##" (bez gwiazdki) + <key>, np. "renderSettings.colorTheme". Dokladnie tego uzywaj w polu "key" propozycji SettingChange — bez zadnych dodatkowych przedrostkow.',
    '   <zasieg> to "character" (ustawienie postaci — dziala po wybraniu postaci) albo "ui" (ustawienie interfejsu).',
    '   "P-" oznacza ustawienie niedostepne w panelu ustawien. "-" jako wartosc domyslna oznacza brak/undefined.',
    '"commands": "<alias> — <opis>" (opcjonalnie "<alias> (<skladnia>) — <opis>"). To komendy wbudowane w klienta, nie komendy gry.',
    '"events": identyfikatory zdarzen dla triggerow zdarzeniowych — "id — etykieta (kategoria)".',
    '"docs": spis stron dokumentacji uzytkownika z ich naglowkami; tresc mozna dociagnac osobno.',
];

/** `##` headings only — `###` sub-headings blow the index budget. */
function topHeadings(markdown: string): string[] {
    return markdown
        .split('\n')
        .map(line => line.match(/^##[^#]\s*(.+)$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map(m => m[1].trim());
}

function buildIndex(
    settings: SettingEntry[],
    commands: CommandEntry[],
    events: EventEntry[],
    docs: DocEntry[],
): KnowledgeIndex {
    // Locations are long and highly repetitive — emit each once as `P<n>` and
    // reference it from the settings lines.
    const locationIds = new Map<string, string>();
    const panels: string[] = [];
    for (const s of settings) {
        if (!s.uiLocation || locationIds.has(s.uiLocation)) continue;
        const id = `P${locationIds.size + 1}`;
        locationIds.set(s.uiLocation, id);
        panels.push(`${id} = ${s.uiLocation}`);
    }

    const settingLines: string[] = [];
    let group = '';
    for (const s of settings) {
        // The group prefix is the storage key alone, so that "prefix + key" is
        // literally the key `lookupSetting` resolves. The scope rides along in
        // parentheses instead of in the prefix, where it used to produce keys
        // (`character.settings.shortenExits`) the validator rejects outright.
        const prefix = s.storageKey;
        if (prefix !== group) {
            group = prefix;
            settingLines.push(`## ${prefix}.* (${s.scope})`);
        }
        const parts = [s.key, s.label ?? '?'];
        parts.push(s.uiLocation ? locationIds.get(s.uiLocation)! : 'P-');
        if (s.options) {
            parts.push(`enum: ${s.options.map(o => String(o.value)).join('|')}`);
        } else {
            let type = s.type;
            if (s.min !== undefined || s.max !== undefined) type += ` ${s.min ?? ''}..${s.max ?? ''}`;
            parts.push(type);
        }
        parts.push(compactValue(s.default));
        settingLines.push(parts.join(' | '));
    }

    // Several regexes can back the same command (`/zi <a> <b>` and
    // `/zi <a> <b> <n>`); at index size they collapse to one line.
    const commandLines = [...new Set(commands.map(c => {
        // Only show a signature when it came from the docs (a real one); the
        // regex-derived fallback is noise at index size.
        const realUsage = c.usage && c.usage !== c.name && !c.usage.includes('<arg');
        const head = realUsage ? `${c.name} (${c.usage})` : c.name;
        return c.description ? `${head} — ${c.description}` : head;
    }))];

    return {
        format: INDEX_FORMAT,
        panels,
        settings: settingLines,
        commands: commandLines,
        events: events.map(e => `${e.id} — ${e.label} (${e.category})`),
        docs: docs.map(d => ({
            id: d.id,
            title: d.title,
            // `##` only — `###` sub-headings blow the index budget.
            headings: topHeadings(d.content),
            tokens: d.tokens,
        })),
    };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

/**
 * The worked examples are hand-written, so check them against the extracted
 * facts: a stale example teaches the model to emit invalid proposals.
 */
function validateSchemas(
    schemas: SchemaCatalog,
    events: EventEntry[],
    settings: SettingEntry[],
    macroTypes: string[],
): void {
    const eventIds = new Set(events.map(e => e.id));
    // Proposal keys, not catalog paths: what a `settingChange` must carry is the
    // validator registry's `<storageKey>.<field>`. Checking the examples against
    // the catalog `path` instead would happily bless keys the client rejects.
    const proposalKeys = new Map(settings.map(s => [settingProposalKey(s), s]));
    const knownMacroTypes = new Set(macroTypes);

    if (proposalKeys.size !== settings.length) {
        fail('two settings share a proposal key (`<storageKey>.<field>`) — the key would be ambiguous');
    }

    // The catalog must document every kind the validator accepts. A missing
    // entry means the model is never taught a shape the client would have
    // applied; a stray entry means it is taught one the client will reject.
    for (const kind of PROPOSAL_KINDS) {
        if (!(kind in schemas)) fail(`schema catalog has no entry for proposal kind \`${kind}\``);
    }

    const checkMacro = (macro: Record<string, unknown>, where: string) => {
        const type = macro.type;
        if (typeof type !== 'string') fail(`${where}: macro without a string \`type\``);
        if (!knownMacroTypes.has(type) && !type.startsWith('plugin:')) {
            fail(`${where}: unknown macro type "${type}"`);
        }
    };

    for (const [name, schema] of Object.entries(schemas)) {
        if (schema.examples.length === 0) fail(`schema \`${name}\` has no worked examples`);
        for (const [i, example] of schema.examples.entries()) {
            const where = `${name}.examples[${i}]`;
            const value = JSON.parse(JSON.stringify(example.value)) as Record<string, unknown>;

            if (name === 'alias') {
                if (typeof value.pattern !== 'string' || typeof value.command !== 'string') {
                    fail(`${where}: UserAlias needs string \`pattern\` and \`command\``);
                }
                try { new RegExp('^' + String(value.pattern) + '$'); } catch { fail(`${where}: pattern does not compile`); }
            }

            if (name === 'userMacro') checkMacro(value, where);

            if (name === 'trigger') {
                const macros = value.macros;
                if (!Array.isArray(macros) || macros.length === 0) fail(`${where}: \`macros\` must be a non-empty array`);
                macros.forEach(m => checkMacro(m as Record<string, unknown>, where));
                if (value.type === 'event') {
                    if (typeof value.event !== 'string' || !eventIds.has(value.event)) {
                        fail(`${where}: event "${String(value.event)}" is not in SUPPORTED_EVENTS`);
                    }
                } else {
                    if (typeof value.pattern !== 'string') fail(`${where}: pattern trigger needs a string \`pattern\``);
                    try { new RegExp(String(value.pattern)); } catch { fail(`${where}: pattern does not compile`); }
                }
            }

            if (name === 'bind') {
                if (typeof value.key !== 'string') fail(`${where}: Bind needs a string \`key\``);
                // `validateBind` treats a missing/blank command as an error, so
                // an example without one teaches a proposal the client rejects.
                if (typeof value.command !== 'string' || value.command.trim() === '') {
                    fail(`${where}: a bind proposal needs a non-empty \`command\``);
                }
            }

            if (name === 'settingChange') {
                if (typeof value.key !== 'string') fail(`${where}: SettingChange needs a string \`key\``);
                const entry = proposalKeys.get(String(value.key));
                if (!entry) {
                    fail(`${where}: "${String(value.key)}" is not a proposal key in the settings catalog (expected "<storageKey>.<field>")`);
                }
                if (entry.options && !entry.options.some(o => String(o.value) === String(value.value))) {
                    fail(`${where}: value "${String(value.value)}" is not one of ${entry.options.map(o => o.value).join('|')}`);
                }
            }
        }
    }
}

function main(): void {
    const overrides = loadOverrides();

    const docs = buildDocs();
    const { schemas, events, macroTypes } = buildSchemas();
    const { entries: settings, panelLines, gaps } = buildSettings(overrides);
    const commands = buildCommands(docs, overrides);
    validateSchemas(schemas, events, settings, macroTypes);
    const index = buildIndex(settings, commands, events, docs);

    const body = {
        formatVersion: KB_FORMAT_VERSION,
        index,
        schemas,
        settings,
        commands,
        events,
        docs,
        gaps: gaps.sort(),
    };
    // Hash over the content only — `generatedAt` must not change the version,
    // so an unchanged tree keeps its cache key.
    const version = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);

    // Both projections are derived through the shared helpers, so the client
    // and the proxy measure exactly what this run reports.
    const draft: KnowledgeBundle = {
        ...body,
        version,
        generatedAt: new Date().toISOString(),
        stats: {
            settings: 0, settingsWithLabels: 0, commands: 0, commandsWithDescriptions: 0,
            events: 0, docs: 0, leanChars: 0, leanTokens: 0, fatChars: 0, fatTokens: 0,
        },
    };
    const leanJson = JSON.stringify(projectLean(draft));
    const fatJson = JSON.stringify(projectFat(draft));

    const bundle: KnowledgeBundle = {
        ...draft,
        stats: {
            settings: settings.length,
            settingsWithLabels: settings.filter(s => s.label).length,
            commands: commands.length,
            commandsWithDescriptions: commands.filter(c => c.description).length,
            events: events.length,
            docs: docs.length,
            leanChars: leanJson.length,
            leanTokens: estimateTokens(leanJson),
            fatChars: fatJson.length,
            fatTokens: estimateTokens(fatJson),
        },
    };

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(bundle, null, 2) + '\n', 'utf8');

    const s = bundle.stats;
    const noLabel = settings.filter(x => !x.label).length;
    const noDesc = commands.filter(c => !c.description).length;

    console.log(`[assistant-kb] wrote ${rel(OUT_FILE)}`);
    console.log(`[assistant-kb] version ${version}  (${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} kB on disk)`);
    console.log('');
    for (const line of panelLines) console.log(`  panel    : ${line}`);
    console.log('');
    console.log(`  settings : ${s.settings}  (${s.settingsWithLabels} z etykieta, ${noLabel} bez)`);
    console.log(`  commands : ${s.commands}  (${s.commandsWithDescriptions} z opisem, ${noDesc} bez)`);
    console.log(`  events   : ${s.events}`);
    console.log(`  docs     : ${s.docs}  (${docs.reduce((a, d) => a + d.tokens, 0)} tok.)`);
    console.log('');
    console.log(`  lean projection : ${s.leanChars.toLocaleString('en-US')} chars  ~${s.leanTokens.toLocaleString('en-US')} tokens`);
    const leanParts: [string, unknown][] = [
        ['index.format', index.format],
        ['index.panels', index.panels],
        ['index.settings', index.settings],
        ['index.commands', index.commands],
        ['index.events', index.events],
        ['index.docs', index.docs],
        ['schemas', projectLean(bundle).schemas],
    ];
    for (const [name, part] of leanParts) {
        console.log(`      ${name.padEnd(15)} ~${estimateTokens(JSON.stringify(part)).toLocaleString('en-US').padStart(6)} tokens`);
    }
    console.log(`  fat  projection : ${s.fatChars.toLocaleString('en-US')} chars  ~${s.fatTokens.toLocaleString('en-US')} tokens`);
    if (s.leanTokens > LEAN_TOKEN_TARGET) {
        console.log(`  NOTE: lean projection is ${s.leanTokens - LEAN_TOKEN_TARGET} tokens over the ~${LEAN_TOKEN_TARGET / 1000}k soft target (see the breakdown above).`);
    }
    if (gaps.length > 0) {
        console.log('');
        console.log(`  ${gaps.length} gap(s) — add overrides in ${rel(OVERRIDES_FILE)}:`);
        for (const gap of gaps.slice(0, 20)) console.log(`    - ${gap}`);
        if (gaps.length > 20) console.log(`    … and ${gaps.length - 20} more (see "gaps" in the bundle)`);
    }
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}

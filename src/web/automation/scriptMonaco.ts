/**
 * Monaco for the Automatyzacja script editor: highlighting, and completion
 * from the plugin API types. Loaded only when a script is opened on a device
 * with a fine pointer (see ScriptCodeEditor); the client never pulls it in.
 */
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import pluginApiTypes from "../../../plugin-types/index.d.ts?raw";
import { SCRIPT_API_NAMES } from "@client/scripts/scriptScope.ts";

/**
 * What a body-only script has in scope (see toModuleSource in
 * @client/scripts/userScripts), so completion knows `api.` and `ctx.`.
 */
const SCRIPT_GLOBALS = `import type { PluginApi } from "plugin-api";

declare global {
    /** API wtyczek: komendy, wyjscie, GMCP, mapa, triggery... */
    const api: PluginApi;
    /** Grupy z wzorca aliasu lub wyzwalacza ($1 to args[0]) albo slowa po komendzie skryptu. */
    const args: string[];
    /** Skad przyszlo uruchomienie. */
    const ctx: {
        source: "alias" | "trigger" | "event" | "command" | "manual";
        /** Wzorzec, zdarzenie albo komenda, ktore go uruchomily. */
        label?: string;
        /** Linia z gry, dla wyzwalacza. */
        line?: string;
        /** Dane zdarzenia, dla wyzwalacza na zdarzenie. */
        event?: any;
        /** Pisze do konsoli skryptu. */
        log(...values: unknown[]): void;
        /** Wspolne dla wszystkich skryptow (to samo co vars). */
        vars: Record<string, any>;
    };
    /** Wspolne dla wszystkich skryptow: jeden zapisze vars.cel, drugi go odczyta. Znika po przeladowaniu strony. */
    const vars: Record<string, any>;
    /** Pisze do konsoli skryptu (ctx.log). */
    function log(...values: unknown[]): void;
    /** Wysyla komende do gry (api.command.send). */
    function send(command: string): Promise<void>;
    /** Wypisuje tekst w oknie gry (api.output.print). */
    function print(text: string): void;
    /** Dane GMCP z chwili uruchomienia (api.gmcp.get()), np. gmcp.char?.state?.hp. */
    const gmcp: Record<string, any>;
${SCRIPT_API_NAMES.map(name => `    /** api.${name} */\n    const ${name}: PluginApi["${name}"];`).join("\n")}
}

export {};
`;

/**
 * A body runs inside a function, so a top-level return is fine there (1108,
 * return outside a function). Top-level await is fine too; treating every
 * file as a module (moduleDetection) already allows it, and 1375/1378 cover
 * the rest.
 */
const BODY_ONLY_ERRORS = [1108, 1375, 1378];

let ready = false;

function setup(): void {
    if (ready) return;
    ready = true;

    const env = self as unknown as { MonacoEnvironment?: monaco.Environment };
    env.MonacoEnvironment ??= {
        getWorker(_: string, label: string) {
            return label === "typescript" || label === "javascript" ? new tsWorker() : new editorWorker();
        },
    };

    const js = monaco.typescript.javascriptDefaults;
    js.setCompilerOptions({
        target: monaco.typescript.ScriptTarget.ESNext,
        // Every file is a module: a script's own `const map` shadows the
        // global `map` section instead of clashing with it, as at runtime.
        moduleDetection: 3,
        module: monaco.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
        allowJs: true,
        checkJs: true,
        allowNonTsExtensions: true,
        noEmit: true,
    });
    js.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        diagnosticCodesToIgnore: BODY_ONLY_ERRORS,
    });
    js.addExtraLib(pluginApiTypes, "file:///node_modules/@types/plugin-api/index.d.ts");
    js.addExtraLib(SCRIPT_GLOBALS, "file:///node_modules/@types/automation-script/index.d.ts");
}

/** A custom property's colour as the browser computes it (var() and color-mix() resolved). */
function computed(el: HTMLElement, property: string, fallback: string): string {
    const probe = document.createElement("span");
    probe.style.color = `var(${property}, ${fallback})`;
    el.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color || fallback;
}

let canvas: CanvasRenderingContext2D | null = null;

/**
 * Any CSS colour as opaque #rrggbb, laid over `under`: Monaco takes only hex,
 * and the theme's colours are often translucent `color(srgb … / 0.8)`.
 * Painting a pixel lets the browser do the parsing and the blending.
 */
function opaqueHex(color: string, under = "#000000"): string {
    canvas ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 })
        .getContext("2d", { willReadFrequently: true });
    if (!canvas) return under;
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = under;
    canvas.fillRect(0, 0, 1, 1);
    canvas.fillStyle = color;
    canvas.fillRect(0, 0, 1, 1);
    const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function isDark(color: string): boolean {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/** A theme from the window's own colours, so the editor matches the app's theme. */
function defineTheme(el: HTMLElement): string {
    const widget = opaqueHex(computed(el, "--popup-bg", "#171b23"));
    const background = opaqueHex(computed(el, "--popup-input-bg", "#0c0f14"), widget);
    const on = (property: string, fallback: string) => opaqueHex(computed(el, property, fallback), background);
    const foreground = on("--popup-text-bright", "#ebe7df");
    const dim = on("--popup-text-dim", "#737a89");
    const accent = on("--popup-accent", "#6da7da");
    const border = on("--popup-border-subtle", "#2a303c");
    monaco.editor.defineTheme("automation", {
        base: isDark(background) ? "vs-dark" : "vs",
        inherit: true,
        rules: [],
        colors: {
            "editor.background": background,
            "editor.foreground": foreground,
            "editorGutter.background": background,
            "editorLineNumber.foreground": dim,
            "editorLineNumber.activeForeground": foreground,
            "editorCursor.foreground": accent,
            "editor.lineHighlightBorder": border,
            "editorWidget.background": widget,
            "editorWidget.border": border,
            "editorSuggestWidget.background": widget,
            "editorSuggestWidget.border": border,
            "editorHoverWidget.background": widget,
            "editorHoverWidget.border": border,
            "focusBorder": accent,
        },
    });
    return "automation";
}

export interface ScriptEditorHandle {
    setValue(value: string): void;
    focus(): void;
    dispose(): void;
}

let modelCount = 0;

export function createScriptEditor(container: HTMLElement, options: {
    value: string;
    onChange: (value: string) => void;
    onSave: () => void;
}): ScriptEditorHandle {
    setup();
    const model = monaco.editor.createModel(
        options.value,
        "javascript",
        monaco.Uri.parse(`file:///automation/script-${++modelCount}.js`),
    );
    const editor = monaco.editor.create(container, {
        model,
        theme: defineTheme(container),
        automaticLayout: true,
        fixedOverflowWidgets: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: getComputedStyle(container).fontFamily,
        fontSize: 13,
        lineHeight: 20,
        tabSize: 4,
        insertSpaces: true,
        renderLineHighlight: "line",
        padding: { top: 8, bottom: 8 },
        overviewRulerLanes: 0,
        wordBasedSuggestions: "off",
    });
    const changes = editor.onDidChangeModelContent(() => options.onChange(model.getValue()));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => options.onSave());

    return {
        setValue(value) {
            if (value !== model.getValue()) model.setValue(value);
        },
        focus() {
            editor.focus();
        },
        dispose() {
            changes.dispose();
            editor.dispose();
            model.dispose();
        },
    };
}

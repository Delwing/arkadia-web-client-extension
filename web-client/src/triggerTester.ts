import Modal from "bootstrap/js/dist/modal";
import { stripAnsiCodes } from "@client/src/stripAnsiCodes";
import type { Trigger } from "@client/src/Triggers";

function initTriggerTester() {
    const button = document.getElementById('trigger-tester-button') as HTMLButtonElement | null;
    const modalEl = document.getElementById('trigger-tester-modal') as HTMLElement | null;
    if (!button || !modalEl) return;
    const modal = new Modal(modalEl);
    const runBtn = modalEl.querySelector('#trigger-tester-run') as HTMLButtonElement;
    const tagInput = modalEl.querySelector('#trigger-tester-tag') as HTMLInputElement;
    const lineInput = modalEl.querySelector('#trigger-tester-line') as HTMLInputElement;
    const typeInput = modalEl.querySelector('#trigger-tester-type') as HTMLInputElement;
    const outputEl = modalEl.querySelector('#trigger-tester-output') as HTMLElement;
    const treeEl = modalEl.querySelector('#trigger-tester-tree') as HTMLElement;

    let selectedPath: Trigger[] | null = null;
    let selectedEl: HTMLElement | null = null;

    button.addEventListener('click', () => {
        buildTree();
        modal.show();
    });

    function buildTree() {
        selectedPath = null;
        selectedEl = null;
        treeEl.innerHTML = '';
        // @ts-ignore
        const manager = (window as any).clientExtension?.Triggers;
        if (!manager) return;
        const roots: Trigger[] = [
            ...Array.from(manager.triggers.values()),
            ...manager.tokenTriggers?.map((t: any) => t.trigger) || [],
            ...Array.from(manager.multilineTriggers.values()),
        ];
        const rootUl = document.createElement('ul');
        roots.forEach(t => rootUl.appendChild(createNode(t, [])));
        treeEl.appendChild(rootUl);
    }

    function createNode(trigger: Trigger, path: Trigger[]): HTMLLIElement {
        const li = document.createElement('li');
        li.textContent = trigger.tag ? `[${trigger.tag}] ${patternToString(trigger.pattern)}` : patternToString(trigger.pattern);
        li.style.cursor = 'pointer';
        li.addEventListener('click', ev => {
            ev.stopPropagation();
            selectedPath = [...path, trigger];
            if (selectedEl) {
                selectedEl.classList.remove('bg-primary', 'text-light');
            }
            selectedEl = li;
            li.classList.add('bg-primary', 'text-light');
        });
        const children = Array.from(trigger.children.values());
        if (children.length) {
            const ul = document.createElement('ul');
            children.forEach(ch => ul.appendChild(createNode(ch, [...path, trigger])));
            li.appendChild(ul);
        }
        return li;
    }

    runBtn.addEventListener('click', () => {
        const tag = tagInput.value.trim();
        const line = lineInput.value;
        const type = typeInput.value.trim();
        outputEl.textContent = '';
        // @ts-ignore
        const triggers = (window as any).clientExtension?.Triggers;
        if (!triggers) {
            outputEl.textContent = 'No trigger manager.';
            return;
        }
        let path = selectedPath;
        if (!path && tag) {
            path = findTriggerPath(tag, triggers);
        }
        if (!path) {
            outputEl.textContent = 'Trigger not found.';
            return;
        }
        const results: string[] = [];
        for (let i = 0; i < path.length; i++) {
            const t = path[i];
            const matched = matchTrigger(t, line, type);
            results.push(`${'  '.repeat(i)}${patternToString(t.pattern)}: ${matched ? 'matched' : 'no match'}`);
            if (!matched) break;
        }
        outputEl.textContent = results.join('\n');
    });
}

function findTriggerPath(tag: string, manager: any): Trigger[] | null {
    const collections: Trigger[] = [
        ...Array.from(manager.triggers.values()),
        ...manager.tokenTriggers?.map((t: any) => t.trigger) || [],
        ...Array.from(manager.multilineTriggers.values()),
    ];
    for (const t of collections) {
        const path = findInTree(t, tag);
        if (path) return path;
    }
    return null;
}

function findInTree(trigger: Trigger, tag: string): Trigger[] | null {
    if (trigger.tag === tag) return [trigger];
    for (const child of trigger.children.values()) {
        const path = findInTree(child, tag);
        if (path) return [trigger, ...path];
    }
    return null;
}

function matchTrigger(trigger: Trigger, rawLine: string, type: string): boolean {
    const line = stripAnsiCodes(rawLine).replace(/\s$/g, '');
    const patterns = Array.isArray(trigger.pattern) ? trigger.pattern : [trigger.pattern];
    for (const pattern of patterns) {
        if (pattern instanceof RegExp) {
            if (line.match(pattern)) return true;
        } else if (typeof pattern === 'string') {
            const index = rawLine.toLowerCase().indexOf(pattern.toLowerCase());
            if (index > -1) return true;
        } else if (typeof pattern === 'function') {
            const res = pattern(rawLine, line, undefined as any, type);
            if (res) return true;
        }
    }
    return false;
}

function patternToString(pattern: any): string {
    if (Array.isArray(pattern)) {
        return pattern.map(patternToString).join(' | ');
    }
    if (pattern instanceof RegExp) return pattern.toString();
    if (typeof pattern === 'string') return pattern;
    if (typeof pattern === 'function') return pattern.name ? `[fn ${pattern.name}]` : '[fn]';
    return String(pattern);
}

document.addEventListener('DOMContentLoaded', initTriggerTester);

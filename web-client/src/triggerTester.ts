import Modal from "bootstrap/js/dist/modal";
import { stripAnsiCodes } from "@client/src/stripAnsiCodes";
import type { Trigger } from "@client/src/Triggers";

function initTriggerTester() {
    const button = document.getElementById('trigger-tester-button') as HTMLButtonElement | null;
    const modalEl = document.getElementById('trigger-tester-modal') as HTMLElement | null;
    if (!button || !modalEl) return;
    const modal = new Modal(modalEl);
    const runBtn = modalEl.querySelector('#trigger-tester-run') as HTMLButtonElement;
    const lineInput = modalEl.querySelector('#trigger-tester-line') as HTMLInputElement;
    const typeInput = modalEl.querySelector('#trigger-tester-type') as HTMLInputElement;
    const outputEl = modalEl.querySelector('#trigger-tester-output') as HTMLElement;
    const treeEl = modalEl.querySelector('#trigger-tester-tree') as HTMLElement;
    const filterInput = modalEl.querySelector('#trigger-tester-filter') as HTMLInputElement;

    modalEl.addEventListener('shown.bs.modal', () => {
        const rect = treeEl.getBoundingClientRect();
        const available = window.innerHeight - rect.top - 40;
        treeEl.style.maxHeight = `${available}px`;
    });

    let selectedPath: Trigger[] | null = null;
    let selectedEl: HTMLElement | null = null;

    button.addEventListener('click', () => {
        filterInput.value = '';
        buildTree('');
        modal.show();
    });

    filterInput.addEventListener('input', () => {
        buildTree(filterInput.value.trim().toLowerCase());
    });

    function buildTree(filter: string) {
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
        roots.forEach(t => {
            const node = createNode(t, [], filter);
            if (node) rootUl.appendChild(node);
        });
        treeEl.appendChild(rootUl);
    }

    function createNode(trigger: Trigger, path: Trigger[], filter: string): HTMLLIElement | null {
        const text = trigger.tag ? `[${trigger.tag}] ${patternToString(trigger.pattern)}` : patternToString(trigger.pattern);
        const match = text.toLowerCase().includes(filter);
        const childNodes = Array.from(trigger.children.values()).map(ch => createNode(ch, [...path, trigger], filter)).filter((n): n is HTMLLIElement => n !== null);
        if (!match && childNodes.length === 0) return null;
        const li = document.createElement('li');
        const currentPath = [...path, trigger];
        let clickTarget: HTMLElement;
        if (childNodes.length) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = text;
            summary.style.cursor = 'pointer';
            details.appendChild(summary);
            const ul = document.createElement('ul');
            childNodes.forEach(ch => ul.appendChild(ch));
            details.appendChild(ul);
            if (filter) details.open = true;
            li.appendChild(details);
            clickTarget = summary;
        } else {
            li.textContent = text;
            li.style.cursor = 'pointer';
            clickTarget = li;
        }
        clickTarget.addEventListener('click', ev => {
            ev.stopPropagation();
            selectedPath = currentPath;
            if (selectedEl) {
                selectedEl.classList.remove('bg-primary', 'text-light');
            }
            selectedEl = clickTarget;
            clickTarget.classList.add('bg-primary', 'text-light');
        });
        return li;
    }

    runBtn.addEventListener('click', () => {
        const line = lineInput.value;
        const type = typeInput.value.trim();
        outputEl.textContent = '';
        // @ts-ignore
        const triggers = (window as any).clientExtension?.Triggers;
        if (!triggers) {
            outputEl.textContent = 'No trigger manager.';
            return;
        }
        const path = selectedPath;
        if (!path) {
            outputEl.textContent = 'Trigger not selected.';
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

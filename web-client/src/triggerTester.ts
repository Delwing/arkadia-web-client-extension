import Modal from "bootstrap/js/dist/modal";
import type { Trigger } from "@client/src/Triggers";
import { matchTrigger, patternToString } from "./triggerUtils";
import { peekClient } from "./runtime/clientProvider";

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
        const manager = peekClient()?.Triggers;
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
        li.textContent = text;
        li.style.cursor = 'pointer';
        const currentPath = [...path, trigger];
        li.addEventListener('click', ev => {
            ev.stopPropagation();
            selectedPath = currentPath;
            if (selectedEl) {
                selectedEl.classList.remove('bg-primary', 'text-light');
            }
            selectedEl = li;
            li.classList.add('bg-primary', 'text-light');
        });
        if (childNodes.length) {
            const ul = document.createElement('ul');
            childNodes.forEach(ch => ul.appendChild(ch));
            li.appendChild(ul);
        }
        return li;
    }

    runBtn.addEventListener('click', () => {
        const line = lineInput.value;
        const type = typeInput.value.trim();
        outputEl.textContent = '';
        const triggers = peekClient()?.Triggers;
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
document.addEventListener('DOMContentLoaded', initTriggerTester);

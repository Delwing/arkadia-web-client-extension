import { useEffect, useState, type RefObject } from 'react';
import mudClient from '@web/MudClient';
import { getRenderSettings } from '@modules/core/settings';
import { CommandLineEngine } from '@web/commandInput/CommandLineEngine';
import { domEditableField } from '@web/commandInput/editableField';
import { localStorageHistoryStore } from '@web/commandInput/commandHistoryStore';
import { harvestOutputWords } from '@web/commandInput/outputWords';
import { useClient } from '../client/ClientContext';
import { useClientEvent } from './useClientEvent';

const OUTPUT_ID = 'main_text_output_msg_wrapper';
const COMMAND_INPUT_ID = 'alt-input';
const MAX_INPUT_ROWS = 6;

/** Grow a `rows=1` textarea to fit its content, up to {@link MAX_INPUT_ROWS}. */
function autoGrow(el: HTMLTextAreaElement): void {
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 18;
    const max = line * MAX_INPUT_ROWS;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
}

export interface UseCommandLineArgs {
    inputRef: RefObject<HTMLTextAreaElement | null>;
    passwordRef: RefObject<HTMLInputElement | null>;
    /** Locate the output surface for Tab completion + focus-scroll. */
    getOutputElement?: () => HTMLElement | null;
}

/**
 * Forge-ui React adapter over the headless {@link CommandLineEngine}. It gives the
 * Forged HUD input the same behaviour the stock UI has — command history + prefix
 * auto-complete, Tab completion from the output buffer, multiline entry, password
 * mode driven by telnet ECHO, and sticky focus — without re-implementing any of
 * that logic. The engine and all listeners are imperative, wired once in an
 * effect and torn down via an AbortController.
 */
export function useCommandLine({ inputRef, passwordRef, getOutputElement }: UseCommandLineArgs): { passwordMode: boolean } {
    const client = useClient();
    const [passwordMode, setPasswordMode] = useState(false);

    const resolveOutput = (): HTMLElement | null =>
        (getOutputElement?.() ?? document.getElementById(OUTPUT_ID));

    useEffect(() => {
        const input = inputRef.current;
        const password = passwordRef.current;
        if (!input) return;

        const engine = new CommandLineEngine({
            field: domEditableField(input),
            passwordField: password ? domEditableField(password) : undefined,
            sendCommand: (cmd, echo, opts, skip, fromUser) => client.sendCommand(cmd, echo, opts, skip, fromUser),
            isPasswordMode: () => mudClient.isPasswordMode(),
            getCommandLineSuggestions: () => client.commandLineSuggestions ?? [],
            getOutputWords: () => harvestOutputWords(resolveOutput()),
            getClearInputOnSend: () => getRenderSettings().clearInputOnSend,
            store: localStorageHistoryStore(),
        });

        const ac = new AbortController();
        const o = { signal: ac.signal };
        let shiftDown = false;

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') shiftDown = true;
            if (e.key === 'ArrowUp' && !e.ctrlKey) {
                e.preventDefault();
                engine.historyMove('up');
            } else if (e.key === 'ArrowDown' && !e.ctrlKey) {
                e.preventDefault();
                engine.historyMove('down');
            } else if (e.key === 'Tab') {
                e.preventDefault();
                engine.handleTabCompletion(!e.shiftKey);
            } else if (e.key === 'Escape') {
                engine.onEscape();
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                engine.onEditKey();
            } else if (e.key !== 'Enter') {
                // Enter is handled by the global handler; everything else that
                // isn't a nav/edit key resets tab completion on next typing.
                engine.resetTabCompletionState();
            }
        }, o);
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') shiftDown = false;
        }, o);
        input.addEventListener('input', () => {
            engine.onInput();
            autoGrow(input);
        }, o);

        // Mobile/IME Enter: keydown Enter may not arrive, so intercept the
        // line-break insertion. Desktop Enter is preventDefault-ed on keydown by
        // the global handler, so this never fires there.
        input.addEventListener('beforeinput', (e) => {
            if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && !shiftDown) {
                e.preventDefault();
                engine.submit();
            }
        }, o);

        // Focus handler: scroll output to bottom and select existing text.
        input.addEventListener('focus', () => {
            const output = resolveOutput();
            if (output) output.scrollTop = output.scrollHeight;
            setTimeout(() => input.select());
        }, o);

        password?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                engine.submit();
            }
        }, o);

        // Global Enter submits the command line from anywhere that isn't another
        // editable field or an open modal (mirrors the stock UI).
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.shiftKey) return;
            const active = document.activeElement as HTMLElement | null;
            if (document.querySelector('.modal.show') && (!active || active.id !== COMMAND_INPUT_ID)) return;
            if (active && active.id !== COMMAND_INPUT_ID &&
                (active.matches('input, textarea') || active.isContentEditable)) {
                return;
            }
            e.preventDefault();
            engine.submit();
        }, o);

        // Sticky focus: clicking the world refocuses the command input unless the
        // user is selecting text or clicking something interactive.
        document.addEventListener('pointerup', (e) => {
            if (e.button !== 0) return;
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) return;
            const target = e.target;
            if (target instanceof Element &&
                target.closest('a, button, input, textarea, select, [contenteditable], .modal')) {
                return;
            }
            (mudClient.isPasswordMode() ? password : input)?.focus();
        }, o);

        // Match the initial height to what the first keystroke would grow it to.
        // The CSS single-row height doesn't account for the textarea's vertical
        // padding, so without this the first input() event snaps the trough taller
        // by one padding's worth. Growing once on mount absorbs that jump.
        autoGrow(input);

        // Initial focus on mount (unless the game already asked for a password).
        if (!mudClient.isPasswordMode()) input.focus();

        return () => ac.abort();
        // Engine + listeners are built once; refs are stable for the mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Password mode is pushed by the client via telnet ECHO negotiation.
    useClientEvent('telnet.echo', (serverEchoing) => setPasswordMode(!!serverEchoing));

    useEffect(() => {
        const input = inputRef.current;
        const password = passwordRef.current;
        if (passwordMode) {
            if (input) input.value = '';
            password?.focus();
        } else {
            if (password) password.value = '';
            input?.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [passwordMode]);

    // Focus the command input when a connection is established (desktop only).
    useClientEvent('client.connect', () => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        if (!mudClient.isPasswordMode()) inputRef.current?.focus();
    });

    return { passwordMode };
}

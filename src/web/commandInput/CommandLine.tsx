import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Lock, Menu, Mic, ArrowRight } from "lucide-react";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { getMainMenuItems, subscribeMainMenu, type MainMenuItem } from "@modules/core/mainMenuRegistry";
import { usePopover } from "@web/layout/hooks/usePopover.ts";
import { attachVoiceInput, type VoiceInputHandle } from "@web/voice/voiceInput.ts";
import { CommandInputController, type CommandInputDeps } from "./CommandInputController";
import { getConnectionView, requestReconnect, subscribeConnectionView } from "./connectionView";
import { useHardwareKeyboard } from "@web-ui/hooks";

export type CommandLineDeps = Pick<CommandInputDeps,
  "outputWrapper" | "sendCommand" | "isPasswordMode" | "getCommandLineSuggestions" | "getClearInputOnSend"> & {
  /** Words the voice recogniser should lean towards (what is on screen, client suggestions). */
  getVoiceVocabulary: () => string[];
};

function showVoiceSetting(): boolean {
  return globalStorage.get("uiSettings")?.showVoiceButton !== false;
}

function tabHintSetting(): boolean {
  return globalStorage.get("uiSettings")?.tabCompletionHint !== false;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The command line: history ▲▼, the field with its ">" prompt, microphone, send and
 * the ⋯ menu. The typing behaviour (history, Tab completion, multiline, password
 * mode, swipe, global Enter) is the headless engine behind {@link CommandInputController};
 * this component only owns the markup and the states the field shows:
 *  - password mode (the server took echo away): the password input with a lock;
 *  - offline (see connectionView): the closed connection and "Połącz ponownie".
 *
 * Ids (#message-input, #send-button, #menu-button, …) are kept: other code and the
 * e2e specs find the command line by them.
 */
export default function CommandLine({ deps }: { deps: CommandLineDeps }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const voiceRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<CommandInputController | null>(null);
  const voiceHandleRef = useRef<VoiceInputHandle | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const [passwordMode, setPasswordMode] = useState(() => deps.isPasswordMode());
  const [showVoice, setShowVoice] = useState(showVoiceSetting);
  const connection = useSyncExternalStore(subscribeConnectionView, getConnectionView);
  const menuItems = useSyncExternalStore(subscribeMainMenu, getMainMenuItems);
  const menu = usePopover({ width: 416, maxHeight: 560, placement: "above" });

  useEffect(() => {
    const controller = new CommandInputController({
      messageInput: inputRef.current!,
      passwordInput: passwordRef.current!,
      sendButton: sendRef.current!,
      historyUpButton: upRef.current,
      historyDownButton: downRef.current,
      outputWrapper: depsRef.current.outputWrapper,
      sendCommand: (...args) => depsRef.current.sendCommand(...args),
      isPasswordMode: () => depsRef.current.isPasswordMode(),
      getCommandLineSuggestions: () => depsRef.current.getCommandLineSuggestions(),
      getClearInputOnSend: () => depsRef.current.getClearInputOnSend(),
    });
    controller.attach();
    controllerRef.current = controller;
    return () => {
      controller.detach();
      controllerRef.current = null;
    };
  }, []);

  // What Tab would complete, shown after the caret (Ustawienia → Komendy). Only with
  // a keyboard to press Tab on, with the caret at the end of a one-line command and
  // nothing selected; worked out a beat after typing stops, since it reads the
  // output's words.
  const hardwareKeyboard = useHardwareKeyboard();
  const [tabHint, setTabHint] = useState(tabHintSetting);
  const [ghost, setGhost] = useState<{ text: string; suffix: string } | null>(null);
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !hardwareKeyboard || !tabHint) {
      setGhost(null);
      return;
    }
    let timer: number | undefined;
    const eligible = () => {
      const text = input.value;
      return document.activeElement === input
        && input.selectionStart === text.length && input.selectionEnd === text.length
        && !text.includes("\n");
    };
    const update = () => {
      window.clearTimeout(timer);
      if (!eligible()) {
        setGhost(null);
        return;
      }
      // Right away, without a flicker: typing along the hinted word just eats into
      // the hint; anything else drops it until the lookup below says otherwise.
      const text = input.value;
      setGhost((prev) => {
        if (!prev || prev.text === text) return prev;
        if (text.startsWith(prev.text)) {
          const typed = text.slice(prev.text.length);
          if (typed.length < prev.suffix.length && prev.suffix.toLowerCase().startsWith(typed.toLowerCase())) {
            return { text, suffix: prev.suffix.slice(typed.length) };
          }
        }
        return null;
      });
      timer = window.setTimeout(() => {
        if (!eligible()) return;
        const current = input.value;
        const suffix = controllerRef.current?.peekTabCompletion();
        setGhost((prev) => {
          if (!suffix) return null;
          return prev && prev.text === current && prev.suffix === suffix ? prev : { text: current, suffix };
        });
      }, 120);
    };
    const clear = () => {
      window.clearTimeout(timer);
      setGhost(null);
    };
    input.addEventListener("input", update);
    input.addEventListener("keyup", update);
    input.addEventListener("focus", update);
    input.addEventListener("blur", clear);
    return () => {
      clear();
      input.removeEventListener("input", update);
      input.removeEventListener("keyup", update);
      input.removeEventListener("focus", update);
      input.removeEventListener("blur", clear);
    };
  }, [hardwareKeyboard, tabHint]);

  // The server asks for a password by taking echo away.
  useEffect(() => eventBus.on("telnet.echo", (echoing: boolean) => setPasswordMode(echoing)), []);
  // After the swap is on screen, so focus lands on the visible field. Not on mount:
  // the login form owns focus then.
  const shownPasswordMode = useRef(passwordMode);
  useLayoutEffect(() => {
    if (shownPasswordMode.current === passwordMode) return;
    shownPasswordMode.current = passwordMode;
    controllerRef.current?.setPasswordMode(passwordMode);
  }, [passwordMode]);

  useEffect(() => globalStorage.onChange("uiSettings", (next) => {
    if (next && "showVoiceButton" in next) setShowVoice(next.showVoiceButton !== false);
    if (next && "tabCompletionHint" in next) setTabHint(next.tabCompletionHint !== false);
  }), []);

  // Turning the button off detaches the recogniser entirely rather than just hiding
  // it, so a player who does not want it never holds a microphone open.
  useEffect(() => {
    if (!showVoice || !voiceRef.current || !inputRef.current) return;
    const handle = attachVoiceInput({
      button: voiceRef.current,
      input: inputRef.current,
      getVocabulary: () => depsRef.current.getVoiceVocabulary(),
    });
    voiceHandleRef.current = handle;
    return () => {
      handle.detach();
      voiceHandleRef.current = null;
    };
  }, [showVoice]);
  // Never listen while the server is asking for a password.
  useEffect(() => {
    voiceHandleRef.current?.setEnabled(!passwordMode);
  }, [passwordMode, showVoice]);

  const offline = connection.offline;
  const placeholder = offline && connection.offlineSince
    ? `Połączenie zamknięte · ${formatTime(connection.offlineSince)}`
    : undefined;

  return (
    <div id="input-area" className={menu.open ? "menu-open" : undefined} data-offline={offline ? "1" : "0"}>
      <div id="history-buttons">
        <button id="history-up-button" ref={upRef} type="button" title="Poprzednia komenda">
          <ChevronUp size={14} strokeWidth={2.2} />
        </button>
        <button id="history-down-button" ref={downRef} type="button" title="Następna komenda">
          <ChevronDown size={14} strokeWidth={2.2} />
        </button>
      </div>
      <div
        id="command-field"
        className={passwordMode ? "is-password" : undefined}
        onMouseDown={(e) => {
          // A click on the frame (prompt, padding) puts the caret in the field.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            (passwordMode ? passwordRef : inputRef).current?.focus();
          }
        }}
      >
        {passwordMode
          ? <Lock className="command-field__lock" size={14} strokeWidth={2.1} />
          : offline
            ? <span className="command-field__offline-dot" />
            : <span className="command-field__prompt">&gt;</span>}
        <div className="command-field__edit" style={passwordMode ? { display: "none" } : undefined}>
          <textarea
            id="message-input"
            ref={inputRef}
            data-command-input=""
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            rows={1}
            placeholder={placeholder}
          />
          {ghost && (
            // The typed text laid out invisibly under the textarea's, so the
            // completion lands right after the caret.
            <div className="command-field__ghost">
              <span className="command-field__ghost-typed">{ghost.text}</span>
              <span className="command-field__ghost-rest">{ghost.suffix}</span>
            </div>
          )}
        </div>
        <input
          type="password"
          id="message-input-password"
          ref={passwordRef}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={passwordMode ? undefined : { display: "none" }}
        />
        {passwordMode && <span className="command-field__hint">nie trafi do historii</span>}
        {!passwordMode && ghost && (
          <span className="command-field__hint command-field__tab-hint"><kbd>Tab</kbd> uzupełnij</span>
        )}
      </div>
      {showVoice && (
        <button id="voice-button" ref={voiceRef} type="button" title="Dyktowanie głosowe">
          <Mic size={16} strokeWidth={2.1} />
        </button>
      )}
      <button id="send-button" ref={sendRef} type="button" title="Wyślij">
        <ArrowRight size={16} strokeWidth={2.2} />
      </button>
      {offline && (
        <button id="connect-button-inline" type="button" onClick={requestReconnect}>Połącz ponownie</button>
      )}
      <div className="command-menu" ref={menu.rootRef}>
        <button
          id="menu-button"
          ref={menu.anchorRef}
          type="button"
          title="Menu"
          className={menu.open ? "is-active" : undefined}
          onClick={menu.toggle}
        >
          <Menu size={17} strokeWidth={2.1} />
        </button>
        {menu.style && (
          <div className="popup-popover command-menu__panel" style={menu.style}>
            {menuItems.map((item) => (
              <MainMenuEntry key={item.id} item={item} onDone={menu.close} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MainMenuEntry({ item, onDone }: { item: MainMenuItem; onDone: () => void }) {
  const pluginAttr = item.source === "plugin" ? { "data-plugin-menu-entry-id": item.id } : { id: item.id };
  return (
    <button
      type="button"
      {...pluginAttr}
      className={`command-menu__item${item.tone === "danger" ? " command-menu__item--danger" : ""}`}
      disabled={item.disabled}
      onClick={() => {
        onDone();
        item.onSelect();
      }}
    >
      {typeof item.label === "string" ? item.label : <NodeLabel node={item.label} />}
    </button>
  );
}

/** A plugin's DOM label, copied in (the plugin keeps its own node). */
function NodeLabel({ node }: { node: Node }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren(node.cloneNode(true));
  }, [node]);
  return <span ref={ref} />;
}

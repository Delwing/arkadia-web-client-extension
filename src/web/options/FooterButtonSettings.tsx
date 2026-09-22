import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button, Check, DeleteButton, Input, Select } from "@web-ui/primitives/index.ts";
import {
    getFooterButtons,
    getFooterButtonStates,
    subscribeFooterButtons,
} from "@modules/core/footerButtonRegistry";
import type { FooterButtonConfig } from "../defaultUiSettings";

interface FooterButtonSettingsProps {
    buttons: FooterButtonConfig[];
    onChange: (buttons: FooterButtonConfig[]) => void;
}

function newId(): string {
    return `btn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * The buttons the player keeps beside the command line: label, the command they
 * send, a tone and - for a button that stands for a mode - the name of the flag
 * that lights it up.
 *
 * Only the player's own buttons are listed. A plugin's button is the plugin's to
 * remove, the way its footer chips are, and shows up below as a reminder that
 * the row has more in it than this list.
 */
function FooterButtonSettings({ buttons, onChange }: FooterButtonSettingsProps) {
    const registered = useSyncExternalStore(subscribeFooterButtons, getFooterButtons, getFooterButtons);
    const fromPlugins = registered.filter(b => b.source === "plugin");
    const liveStates = getFooterButtonStates();

    const patch = (index: number, changes: Partial<FooterButtonConfig>) => {
        onChange(buttons.map((b, i) => (i === index ? { ...b, ...changes } : b)));
    };

    const move = (index: number, by: number) => {
        const target = index + by;
        if (target < 0 || target >= buttons.length) return;
        const next = [...buttons];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next.map((b, i) => ({ ...b, order: i })));
    };

    const remove = (index: number) => {
        onChange(buttons.filter((_, i) => i !== index).map((b, i) => ({ ...b, order: i })));
    };

    const add = () => {
        onChange([
            ...buttons,
            { id: newId(), label: "", command: "", tone: "neutral", hidden: false, order: buttons.length },
        ]);
    };

    return (
        <div className="footer-button-settings">
            {buttons.length === 0 && (
                <p className="popup-field__hint">
                    Nie masz jeszcze zadnych przyciskow. Kazdy wysyla swoja komende - moze to
                    byc zwykla komenda, alias albo cokolwiek, co przyjmuje linia komend.
                </p>
            )}
            {buttons.map((button, index) => (
                <div key={button.id} className="footer-button-settings__row" data-footer-button-row={button.id}>
                    <div className="footer-button-settings__line">
                        <Check
                            id={`ui-footer-button-visible-${button.id}`}
                            title="Widoczny w stopce"
                            checked={!button.hidden}
                            onChange={(e) => patch(index, { hidden: !e.target.checked })}
                        />
                        <Input
                            className="footer-button-settings__label"
                            value={button.label}
                            placeholder="Napis, np. zabij cel"
                            onChange={(e) => patch(index, { label: e.target.value })}
                        />
                        <Input
                            mono
                            className="footer-button-settings__command"
                            value={button.command}
                            placeholder="Komenda, np. zabij cel"
                            onChange={(e) => patch(index, { command: e.target.value })}
                        />
                        <Button
                            size="sm"
                            variant="ghost"
                            className="popup-btn--icon"
                            title="W gore"
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                        >
                            <ChevronUp size={14} strokeWidth={2} />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="popup-btn--icon"
                            title="W dol"
                            disabled={index === buttons.length - 1}
                            onClick={() => move(index, 1)}
                        >
                            <ChevronDown size={14} strokeWidth={2} />
                        </Button>
                        <DeleteButton title="Usun przycisk" onClick={() => remove(index)} />
                    </div>
                    <div className="footer-button-settings__line footer-button-settings__line--minor">
                        <Select
                            className="settings-narrow"
                            title="Kolor przycisku"
                            value={button.tone ?? "neutral"}
                            onChange={(e) => patch(index, { tone: e.target.value as FooterButtonConfig["tone"] })}
                        >
                            <option value="neutral">Zwykly</option>
                            <option value="accent">Wyrozniony</option>
                            <option value="danger">Czerwony</option>
                        </Select>
                        <Input
                            mono
                            list="ui-footer-button-states"
                            className="footer-button-settings__state"
                            value={button.state ?? ""}
                            placeholder="Stan wl./wyl. (opcjonalnie), np. podroz"
                            onChange={(e) => patch(index, { state: e.target.value })}
                        />
                    </div>
                </div>
            ))}
            <datalist id="ui-footer-button-states">
                {liveStates.map(name => <option key={name} value={name} />)}
            </datalist>
            <Button size="sm" id="ui-footer-button-add" className="ui-settings-self-start" onClick={add}>
                <Plus size={14} strokeWidth={2} />Dodaj przycisk
            </Button>
            <p className="popup-field__hint">
                Przycisk ze stanem swieci sie, gdy ten stan jest wlaczony - wlacza go trigger
                albo skrypt komenda <code>/przycisk nazwa on</code> (<code>off</code> gasi), albo wtyczka.
            </p>
            {fromPlugins.length > 0 && (
                <p className="popup-field__hint">
                    W stopce sa tez przyciski wtyczek ({fromPlugins.map(b => b.label).join(", ")}).
                    Dodaje i usuwa je wtyczka, nie ta lista.
                </p>
            )}
        </div>
    );
}

export default FooterButtonSettings;

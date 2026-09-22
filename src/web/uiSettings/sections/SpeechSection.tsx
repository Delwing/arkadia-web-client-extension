import { useEffect, useState } from "react";
import type { UiSettings } from "../../uiSettingsCore";
import { Button, Input } from "@web-ui/primitives/index.ts";
import { CheckboxRow, RangeField, SelectField, SettingsSection } from "../fields";
import { getVoices, isTtsSupported, resolveVoice, speak, stopSpeaking } from "../../voice/textToSpeech";

interface SpeechSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

const SAMPLE_TEXT = "Atakuje cie wielki czarny troll!";

/** Voices sorted Polish first, then by language and name. */
function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
    const isPolish = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("pl");
    return [...voices].sort((a, b) =>
        Number(isPolish(b)) - Number(isPolish(a))
        || a.lang.localeCompare(b.lang)
        || a.name.localeCompare(b.name));
}

function useVoices(): SpeechSynthesisVoice[] {
    const [voices, setVoices] = useState(() => sortVoices(getVoices()));
    useEffect(() => {
        if (!isTtsSupported()) return;
        const refresh = () => setVoices(sortVoices(getVoices()));
        window.speechSynthesis.addEventListener("voiceschanged", refresh);
        refresh();
        return () => window.speechSynthesis.removeEventListener("voiceschanged", refresh);
    }, []);
    return voices;
}

function SpeechSection({ draft, update }: SpeechSectionProps) {
    const voices = useVoices();
    const [sample, setSample] = useState(SAMPLE_TEXT);

    if (!isTtsSupported()) {
        return (
            <SettingsSection title="Czytanie na głos">
                <div className="popup-field__hint">Ta przeglądarka nie obsługuje syntezy mowy.</div>
            </SettingsSection>
        );
    }

    const autoVoice = resolveVoice(voices, "");
    const missingVoice = draft.ttsVoice !== "" && !voices.some(v => v.voiceURI === draft.ttsVoice);
    const hasPolish = voices.some(v => v.lang.toLowerCase().startsWith("pl"));

    return (
        <SettingsSection title="Czytanie na głos">
            <div className="popup-field__hint">
                Czyta teksty z akcji „Czytaj na głos” w triggerach (Menu → Triggery).
                „Wycisz dźwięki” ucisza też mowę.
            </div>
            <CheckboxRow id="ui-tts-enabled" label="Czytanie na głos włączone" checked={draft.ttsEnabled} onChange={(v) => update({ ttsEnabled: v })} />
            <SelectField
                id="ui-tts-voice"
                label="Głos"
                hint={missingVoice
                    ? "Wybranego głosu nie ma na tym urządzeniu — używany jest automatyczny."
                    : voices.length > 0 && !hasPolish
                        ? "Brak polskiego głosu w systemie — polskie teksty mogą brzmieć niewyraźnie."
                        : "Ustawienie jest zapisywane osobno dla każdego urządzenia."}
                value={draft.ttsVoice}
                onChange={(v) => update({ ttsVoice: v })}
            >
                <option value="">Automatyczny{autoVoice ? ` (${autoVoice.name})` : ""}</option>
                {missingVoice && <option value={draft.ttsVoice}>{draft.ttsVoice} (niedostępny)</option>}
                {voices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} — {v.lang}{v.localService ? "" : " (online)"}</option>
                ))}
            </SelectField>
            <RangeField id="ui-tts-rate" label="Tempo" value={draft.ttsRate} min={0.5} max={2} step={0.1} onChange={(v) => update({ ttsRate: v })} />
            <RangeField id="ui-tts-pitch" label="Wysokość" value={draft.ttsPitch} min={0} max={2} step={0.1} onChange={(v) => update({ ttsPitch: v })} />
            <RangeField id="ui-tts-volume" label="Głośność" value={draft.ttsVolume} min={0} max={1} step={0.05} onChange={(v) => update({ ttsVolume: v })} />
            <CheckboxRow
                id="ui-tts-interrupt"
                label="Nowy komunikat przerywa aktualnie czytany"
                checked={draft.ttsInterrupt}
                onChange={(v) => update({ ttsInterrupt: v })}
            />
            <div className="popup-inline">
                <Input id="ui-tts-sample" value={sample} onChange={(e) => setSample(e.target.value)} />
                <Button size="sm" id="ui-tts-preview" onClick={() => speak(sample, { ...draft, ttsInterrupt: true })}>{"▶"} Przeczytaj</Button>
                <Button size="sm" variant="ghost" onClick={stopSpeaking}>Zatrzymaj</Button>
            </div>
        </SettingsSection>
    );
}

export default SpeechSection;

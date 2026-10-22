import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, Field, Input } from '@web-ui/primitives/index.ts';
import { getZlomSnapshot, subscribeZlom, type ZlomSnapshot } from '@modules/data/zlomStore';
import {
    assignILine,
    assignPiece,
    coveredBy,
    previewILine,
    rankILineCandidates,
    type ILineCandidate,
} from '@client/scripts/armor';

/** Close matches proposed before anything is typed */
const PROPOSED = 5;
/** Results of a search shown at once */
const SHOWN = 8;

const SLOT_NAMES: Record<string, string> = {
    glowa: 'głowa',
    korpus: 'korpus',
    'lewe ramie': 'lewe ramię',
    'prawe ramie': 'prawe ramię',
    dlonie: 'dłonie',
    nogi: 'nogi',
    stopy: 'stopy',
    tarcza: 'tarcza',
};

/** An unrecognised line of the `i` reply, or a piece it lists by name but nothing places */
export type ILineSubject =
    | { type: 'line'; line: string; fragment: string }
    | { type: 'piece'; name: string };

function useZlomSnapshot(): ZlomSnapshot {
    const [snapshot, setSnapshot] = useState(getZlomSnapshot);
    useEffect(() => subscribeZlom(setSnapshot), []);
    return snapshot;
}

const nameOf = (candidate: ILineCandidate) => candidate.entry.shortAlt || candidate.entry.short;
const slotsOf = (candidate: ILineCandidate) => coveredBy(candidate.kind, candidate.entry);
const coverText = (slots: string[]) => slots.map(slot => SLOT_NAMES[slot] ?? slot).join(', ');

/**
 * Match what the `i` reply says to a piece already in the złom list. For a
 * line, the part of it that names the piece (selected, or the whole line)
 * becomes that piece's `i` line; for a piece listed by a name the list does
 * not know, that name does. What it covers is never set here: it comes from
 * `ocen`, so a piece whose cover is not known yet cannot be matched.
 */
const ArmorILinePicker: React.FC<{
    subject: ILineSubject;
    lines: string[];
    onClose: () => void;
}> = ({ subject, lines, onClose }) => {
    const snapshot = useZlomSnapshot();
    const text = subject.type === 'line' ? subject.line : subject.name;
    const [fragment, setFragment] = useState(subject.type === 'line' ? subject.fragment : '');
    const [filter, setFilter] = useState('');
    const [chosen, setChosen] = useState<{ kind: ILineCandidate['kind']; opis: string } | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (subject.type === 'line') setFragment(subject.fragment);
    }, [subject]);

    const ranked = useMemo(() => rankILineCandidates(text, snapshot), [text, snapshot]);
    const needle = filter.trim().toLowerCase();
    const shown = useMemo(() => needle
        ? ranked.filter(c => `${c.entry.short} ${c.entry.shortAlt ?? ''}`.toLowerCase().includes(needle)).slice(0, SHOWN)
        : ranked.filter(c => c.score > 0).slice(0, PROPOSED),
    [ranked, needle]);

    const target = chosen ? ranked.find(c => c.kind === chosen.kind && c.entry.opis === chosen.opis) : undefined;
    const slots = target ? slotsOf(target) : [];

    // A line: the fragment must match it. A piece: nothing to match, its name is the line
    const preview = target && subject.type === 'line'
        ? previewILine(fragment, lines, snapshot, target.kind, target.entry)
        : null;
    const coversLine = subject.type === 'piece' || !!preview?.matched.includes(subject.line);
    const fragmentOk = subject.type === 'piece' || !!preview?.valid;
    const canSave = !!target && fragmentOk && coversLine && slots.length > 0 && !saving;
    const renames = subject.type === 'piece' && target
        && ![target.entry.short, target.entry.shortAlt].some(n => n?.toLowerCase() === subject.name.toLowerCase());

    const save = async () => {
        if (!target || !canSave) return;
        setSaving(true);
        if (subject.type === 'line') {
            await assignILine(target.kind, target.entry.opis, fragment.trim());
        } else {
            await assignPiece(subject.name, target.kind, target.entry.opis);
        }
        setSaving(false);
        onClose();
    };

    return (
        <Dialog
            title="Wskaż przedmiot ze złomu"
            onClose={onClose}
            className="armor-iline"
            footer={(
                <>
                    <Button onClick={onClose}>Anuluj</Button>
                    <Button variant="solid" onClick={() => void save()} disabled={!canSave}>Zapisz</Button>
                </>
            )}
        >
            <Field label={subject.type === 'line' ? 'Linia z i' : 'Przedmiot z i'}>
                <div className="armor-iline__line">{text}</div>
            </Field>
            {subject.type === 'line' && (
                <Field label="Fragment" hint="Tekst, który zawiera linia z i, albo /regexp/.">
                    <Input
                        mono
                        value={fragment}
                        onChange={e => setFragment(e.target.value)}
                    />
                </Field>
            )}
            <Field label={needle ? 'Wyniki ze złomu' : 'Podobne w złomie'}>
                {ranked.length === 0 ? (
                    <div className="armor-iline__empty">
                        W złomie nie ma jeszcze zbroi ani tarcz. Oceń przedmiot, żeby móc go tu wybrać.
                    </div>
                ) : (
                    <>
                        {shown.length > 0 ? (
                            <ul className="armor-iline__candidates">
                                {shown.map(candidate => {
                                    const active = candidate.kind === chosen?.kind && candidate.entry.opis === chosen.opis;
                                    const covers = slotsOf(candidate);
                                    return (
                                        <li key={`${candidate.kind}:${candidate.entry.opis}`}>
                                            <button
                                                type="button"
                                                className={`armor-iline__candidate${active ? ' armor-iline__candidate--active' : ''}`}
                                                onClick={() => setChosen({ kind: candidate.kind, opis: candidate.entry.opis })}
                                            >
                                                <span className="armor-iline__candidate-name">{nameOf(candidate)}</span>
                                                <span className="armor-iline__candidate-meta">
                                                    {covers.length ? coverText(covers) : 'osłona nieznana'}
                                                    {candidate.entry.iLine ? ' · ma linię i' : ''}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="armor-iline__empty">
                                {needle ? 'Nic w złomie o takiej nazwie.' : 'Nic podobnego w złomie. Wyszukaj po nazwie.'}
                            </div>
                        )}
                        <Input placeholder="Szukaj w całym złomie..." value={filter} onChange={e => setFilter(e.target.value)} />
                    </>
                )}
            </Field>
            {target && (
                <div className="armor-iline__preview">
                    {slots.length > 0 ? (
                        <div>{nameOf(target)} zajmie: {coverText(slots)}</div>
                    ) : (
                        <div className="armor-iline__warn armor-iline__warn--error">
                            Złom nie wie, co ten przedmiot osłania. Oceń go (<code>ocen</code>), a potem przypisz.
                        </div>
                    )}
                    {preview && !preview.valid && (
                        <div className="armor-iline__warn armor-iline__warn--error">Pusty fragment albo błędny regexp.</div>
                    )}
                    {preview?.valid && !coversLine && (
                        <div className="armor-iline__warn armor-iline__warn--error">Ten fragment nie pasuje do wybranej linii.</div>
                    )}
                    {renames && (
                        <div>Złom zapamięta, że <code>i</code> podaje go jako „{text}”.</div>
                    )}
                    {preview && preview.matched.length > 1 && (
                        <div className="armor-iline__warn">
                            Pasuje też do innych linii: {preview.matched.filter(l => l !== text).join(' / ')}
                        </div>
                    )}
                    {preview && preview.clashes.length > 0 && (
                        <div className="armor-iline__warn">Tę linię rozpoznaje już: {preview.clashes.join(', ')}</div>
                    )}
                    {target.entry.iLine && (subject.type === 'line' || renames) && (
                        <div className="armor-iline__warn">Zastąpi obecną linię i: <code>{target.entry.iLine}</code></div>
                    )}
                </div>
            )}
        </Dialog>
    );
};

export default ArmorILinePicker;

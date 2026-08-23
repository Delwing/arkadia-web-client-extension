import { useCallback, useEffect, useMemo, useState } from "react";
import { Form, Alert, Badge, Button } from "react-bootstrap";
import { getScriptRegistry, getPluginManager } from "@client/main";
import { scriptCatalog } from "@client/scriptCatalog";
import { getPluginsUsingScript } from "@modules/core/pluginScriptUsage";
import eventBus from "@modules/core/eventBus";
import SubDialog from "../SubDialog";
import type { ScriptState } from "@client/ScriptRegistry";

/**
 * Turn individual feature scripts off for this character.
 *
 * Reads the live `ScriptRegistry` rather than storage: the registry is what
 * actually decides whether something runs, and it derives the `requires`
 * cascade. Storage only records the choices the user made by hand, so a list
 * built from it would show a cascade-disabled script as still on.
 *
 * Per character, not global — see docs/SCRIPT_DEPENDENCIES.md, *Decisions* §4.
 */

interface Row {
    id: string;
    title: string;
    description: string;
    state: ScriptState;
}

function readRows(): Row[] {
    const registry = getScriptRegistry();
    if (!registry) return [];
    return registry.declared.map(id => {
        const entry = scriptCatalog[id];
        return {
            id,
            // A script with no catalog entry cannot happen — a test enforces it —
            // but showing the id beats rendering an empty row if one ever slips.
            title: entry?.title ?? id,
            description: entry?.description ?? '',
            state: registry.stateOf(id) ?? { status: 'off' },
        };
    });
}

/**
 * What a loaded plugin calls itself, falling back to the id it was loaded from.
 * A URL is a poor thing to show someone deciding whether to break it.
 */
function pluginLabel(pluginId: string): string {
    const loaded = getPluginManager()?.getPlugin?.(pluginId);
    return loaded?.info?.name ?? pluginId;
}

function Features() {
    const [rows, setRows] = useState<Row[]>(readRows);
    const [filter, setFilter] = useState('');
    // Set while a disable waits for the user to accept it may break a plugin.
    const [warning, setWarning] = useState<{ id: string; title: string; plugins: string[] } | null>(null);

    const refresh = useCallback(() => setRows(readRows()), []);

    useEffect(() => {
        // The registry announces every change, including the cascade a single
        // toggle sets off, so one subscription keeps the whole list honest.
        refresh();
        return eventBus.on('scripts.stateChanged', refresh);
    }, [refresh]);

    const apply = useCallback((id: string, on: boolean) => {
        const registry = getScriptRegistry();
        if (!registry) return;
        if (on) registry.enable(id);
        else registry.disable(id);
        // `scripts.stateChanged` refreshes us, but do it here too so the switch
        // never lags behind the click if the event is ever made async.
        refresh();
    }, [refresh]);

    const toggle = useCallback((id: string, title: string, on: boolean) => {
        // Three scripts own surfaces plugins can register against. Turning one of
        // them off is allowed — it is the user's own client, and a plugin does not
        // get a veto — but not silently, and not without naming what it affects.
        // See Decisions §1.
        const plugins = on ? [] : getPluginsUsingScript(id);
        if (plugins.length) {
            setWarning({ id, title, plugins: plugins.map(pluginLabel) });
            return;
        }
        apply(id, on);
    }, [apply]);

    const confirmWarning = useCallback(() => {
        if (!warning) return;
        apply(warning.id, false);
        setWarning(null);
    }, [warning, apply]);

    const visible = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter(row =>
            row.title.toLowerCase().includes(needle)
            || row.description.toLowerCase().includes(needle)
            || row.id.toLowerCase().includes(needle));
    }, [rows, filter]);

    const offCount = rows.filter(row => row.state.status !== 'running').length;

    if (!rows.length) {
        return <Alert variant="secondary">Lista funkcji jest dostępna po połączeniu z grą.</Alert>;
    }

    return (
        <div className="features-options">
            <p className="text-body-secondary small mb-2">
                Wyłączone funkcje nie są uruchamiane — znikają ich aliasy, triggery i przyciski.
                Ustawienie dotyczy tylko tej postaci.
            </p>

            <Form.Control
                type="search"
                value={filter}
                placeholder="Szukaj funkcji…"
                onChange={event => setFilter(event.target.value)}
                className="mb-3"
            />

            {offCount > 0 && (
                <p className="text-body-secondary small">Wyłączonych: {offCount} z {rows.length}.</p>
            )}

            <div className="features-list">
                {visible.map(row => {
                    const state = row.state;
                    const blocked = state.status === 'blocked';
                    return (
                        <div key={row.id} data-script={row.id} className="features-row d-flex align-items-start gap-2 py-2 border-bottom">
                            <Form.Check
                                type="switch"
                                id={`feature-${row.id}`}
                                className="mt-1"
                                checked={state.status === 'running'}
                                // A blocked script is not the user's choice to make here:
                                // it is waiting on the one it requires, which is the switch
                                // that needs turning back on.
                                disabled={blocked}
                                onChange={event => toggle(row.id, row.title, event.target.checked)}
                                label=""
                            />
                            <div className="flex-grow-1">
                                <label htmlFor={`feature-${row.id}`} className="fw-semibold d-block">
                                    {row.title}
                                    {state.status === 'blocked' && (
                                        <Badge bg="secondary" className="ms-2 fw-normal">
                                            wymaga: {scriptCatalog[state.by]?.title ?? state.by}
                                        </Badge>
                                    )}
                                </label>
                                <span className="text-body-secondary small">{row.description}</span>
                            </div>
                        </div>
                    );
                })}
                {!visible.length && (
                    <p className="text-body-secondary small py-2">Nic nie pasuje do „{filter}”.</p>
                )}
            </div>

            {warning && (
                <SubDialog
                    title="Ta funkcja jest używana przez wtyczki"
                    onClose={() => setWarning(null)}
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setWarning(null)}>Anuluj</Button>
                            <Button variant="danger" onClick={confirmWarning}>Wyłącz mimo to</Button>
                        </>
                    }
                >
                    <p>
                        Funkcja <strong>{warning.title}</strong> udostępnia dane wtyczkom.
                        Po wyłączeniu przestaną je otrzymywać:
                    </p>
                    <ul className="mb-0">
                        {warning.plugins.map(name => <li key={name}>{name}</li>)}
                    </ul>
                </SubDialog>
            )}
        </div>
    );
}

export default Features;

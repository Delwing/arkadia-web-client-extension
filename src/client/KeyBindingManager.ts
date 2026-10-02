import type Client from "./Client";
import { formatLabel } from "./scripts/functionalBind";
import { globalStorage } from "@modules/core/storage";
import { bindMatches, MAX_TEMP_BIND_SLOTS } from "@modules/core/keymapTypes";
import { switchKeymap, getActiveKeymapId } from "@modules/core/keymapStorage";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import type { HotkeyMsg } from "@modules/helper/helperProtocol";

const DOUBLE_PRESS_WINDOW_MS = 1000;
const DOUBLE_K_COMMAND = '+k';

type BindConfig = {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
};

export default class KeyBindingManager {
    lampBind: BindConfig = { key: "Digit4", ctrl: true };
    attackBind: BindConfig = { key: "Digit1", ctrl: true };
    supportBind: BindConfig = { key: "KeyQ", ctrl: true };
    moveModeBind: BindConfig = { key: "Backquote" };
    doubleKBind: BindConfig = { key: "Equal", ctrl: true, alt: true };
    customBinds: (BindConfig & { command: string })[] = [];
    tempBinds: (BindConfig & { command: string | null })[] = [
        { key: 'F4', command: null },
        { key: 'F5', command: null },
    ];

    private client: Client;
    private lastDoubleKPress = Number.NEGATIVE_INFINITY;

    constructor(client: Client, helperConnection?: HelperConnection) {
        this.client = client;
        this.seedBindsFromActiveKeymap();
        this.setupKeydownListener();
        this.setupBindsListener();
        this.setupHelperBindListener();
        if (helperConnection) {
            this.setupHelperListener(helperConnection);
        }
    }

    // Any UI that builds a Client gets its keybinds seeded from the active keymap.
    // The flat `binds` key is what every keybind consumer reads; until it is
    // written the configured binds silently don't fire. Only seed when absent so
    // we don't clobber an existing binds set or force keymap migration.
    private seedBindsFromActiveKeymap() {
        try {
            if (!globalStorage.get('binds')) {
                switchKeymap(getActiveKeymapId());
            }
        } catch {
            // ignore malformed keymap data
        }
    }

    private setupHelperBindListener() {
        this.client.on('helperBind', (bindName) => {
            switch (bindName) {
                case 'lamp':
                    this.client.sendCommand('napelnij lampe olejem');
                    break;
                case 'attack': {
                    const id = this.client.TeamManager.getAttackTargetId?.();
                    if (id) {
                        if (this.client.AllyProtection.isAlly(id)) {
                            if (this.client.AllyProtection.checkPendingAttack(id, 'attackBind')) {
                                this.client.sendCommand(`${this.client.attackCommand} ob_${id}`);
                            } else {
                                const info = this.client.AllyProtection.getAllyInfo(id);
                                this.client.AllyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
                                this.client.AllyProtection.setPendingAttack(id, 'attackBind');
                            }
                        } else {
                            this.client.sendCommand(`${this.client.attackCommand} ob_${id}`);
                        }
                    }
                    break;
                }
                case 'support': {
                    const targetId = this.client.TeamManager.getAttackTargetId?.();
                    if (targetId && this.client.AllyProtection.isAlly(targetId)) {
                        if (this.client.AllyProtection.checkPendingAttack(targetId, 'supportBind')) {
                            this.client.support();
                        } else {
                            const info = this.client.AllyProtection.getAllyInfo(targetId);
                            this.client.AllyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
                            this.client.AllyProtection.setPendingAttack(targetId, 'supportBind');
                        }
                    } else {
                        this.client.support();
                    }
                    break;
                }
            }
            const temp = /^temp(\d+)$/.exec(bindName);
            const tempCommand = temp ? this.tempBinds[Number(temp[1]) - 1]?.command : null;
            if (tempCommand) this.client.sendCommand(tempCommand);
        });
    }

    setTempBind(index: number, command: string) {
        const bind = this.tempBinds[index];
        if (!bind) {
            this.client.println(`Brak tymczasowego przypisania ${index + 1} - dodaj je w oknie Klawisze.`);
            return;
        }
        const trimmed = command.trim();
        bind.command = trimmed ? trimmed : null;
        const label = bind.key ? formatLabel(bind) : 'bez klawisza';
        if (bind.command) {
            this.client.println(`Tymczasowe przypisanie ${index + 1} (${label}) ustawione na: ${bind.command}`);
        } else {
            this.client.println(`Tymczasowe przypisanie ${index + 1} (${label}) zostalo wyczyszczone.`);
        }
    }

    private setupKeydownListener() {
        window.addEventListener('keydown', (ev) => {
            if (bindMatches(ev, this.lampBind)) {
                this.client.sendCommand('napelnij lampe olejem');
                ev.preventDefault();
            }
            if (bindMatches(ev, this.attackBind)) {
                const id = this.client.TeamManager.getAttackTargetId?.();
                if (id) {
                    if (this.client.AllyProtection.isAlly(id)) {
                        if (this.client.AllyProtection.checkPendingAttack(id, 'attackBind')) {
                            const command = `${this.client.attackCommand} ob_${id}`;
                            this.client.sendCommand(command);
                        } else {
                            const info = this.client.AllyProtection.getAllyInfo(id);
                            this.client.AllyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
                            this.client.AllyProtection.setPendingAttack(id, 'attackBind');
                        }
                    } else {
                        const command = `${this.client.attackCommand} ob_${id}`;
                        this.client.sendCommand(command);
                    }
                }
                ev.preventDefault();
            }
            if (bindMatches(ev, this.supportBind)) {
                const targetId = this.client.TeamManager.getAttackTargetId?.();
                if (targetId && this.client.AllyProtection.isAlly(targetId)) {
                    if (this.client.AllyProtection.checkPendingAttack(targetId, 'supportBind')) {
                        this.client.support();
                    } else {
                        const info = this.client.AllyProtection.getAllyInfo(targetId);
                        this.client.AllyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
                        this.client.AllyProtection.setPendingAttack(targetId, 'supportBind');
                    }
                } else {
                    this.client.support();
                }
                ev.preventDefault();
            }
            if (bindMatches(ev, this.doubleKBind)) {
                ev.preventDefault();
                const now = performance.now();
                if (now - this.lastDoubleKPress <= DOUBLE_PRESS_WINDOW_MS) {
                    this.lastDoubleKPress = Number.NEGATIVE_INFINITY;
                    this.client.sendCommand(DOUBLE_K_COMMAND);
                } else {
                    this.lastDoubleKPress = now;
                }
            }
            this.customBinds.forEach(cb => {
                if (bindMatches(ev, cb)) {
                    this.client.sendCommand(cb.command);
                    ev.preventDefault();
                }
            });
            this.tempBinds.forEach(tb => {
                if (!tb.command || !tb.key) {
                    return;
                }
                if (bindMatches(ev, tb)) {
                    this.client.sendCommand(tb.command);
                    ev.preventDefault();
                }
            });
        });
    }

    private setupBindsListener() {
        const applyBinds = (b: any) => {
            if (!b) {
                return;
            }
            const bind = b?.main;
            if (bind) {
                this.client.FunctionalBind.updateOptions({
                    key: bind.key,
                    ctrl: bind.ctrl,
                    alt: bind.alt,
                    shift: bind.shift,
                    label: formatLabel(bind)
                });
            }
            const gatesBind = b?.mainGates || bind;
            if (gatesBind) {
                this.client.FunctionalBind.updateOptions({
                    key: gatesBind.key,
                    ctrl: gatesBind.ctrl,
                    alt: gatesBind.alt,
                    shift: gatesBind.shift,
                    label: formatLabel(gatesBind)
                }, 'gates');
            }
            const transportBind = b?.mainTransport || bind;
            if (transportBind) {
                this.client.FunctionalBind.updateOptions({
                    key: transportBind.key,
                    ctrl: transportBind.ctrl,
                    alt: transportBind.alt,
                    shift: transportBind.shift,
                    label: formatLabel(transportBind)
                }, 'transport');
            }
            const lootBind = b?.mainLoot || bind;
            if (lootBind) {
                this.client.FunctionalBind.updateOptions({
                    key: lootBind.key,
                    ctrl: lootBind.ctrl,
                    alt: lootBind.alt,
                    shift: lootBind.shift,
                    label: formatLabel(lootBind)
                }, 'loot');
            }
            const lamp = b?.lamp;
            if (lamp) {
                this.lampBind = { ...lamp };
            }
            const attack = b?.attack;
            if (attack) {
                this.attackBind = { ...attack };
            }
            const support = b?.support;
            if (support) {
                this.supportBind = { ...support };
            }
            const moveMode = b?.moveMode;
            if (moveMode) {
                this.moveModeBind = { ...moveMode };
            }
            const doubleK = b?.doubleK;
            if (doubleK) {
                this.doubleKBind = { ...doubleK };
                this.lastDoubleKPress = Number.NEGATIVE_INFINITY;
            }
            // One temp bind per keymap slot; a slot keeps its command across key changes.
            const temp = b?.temp;
            if (Array.isArray(temp)) {
                this.tempBinds = temp.slice(0, MAX_TEMP_BIND_SLOTS).map((tempBind: any, index: number) => {
                    const valid = !!tempBind && typeof tempBind === 'object' && typeof tempBind.key === 'string';
                    return {
                        key: valid ? tempBind.key : '',
                        ctrl: valid && tempBind.ctrl ? true : undefined,
                        alt: valid && tempBind.alt ? true : undefined,
                        shift: valid && tempBind.shift ? true : undefined,
                        command: this.tempBinds[index]?.command ?? null,
                    };
                });
            }
            const custom = b?.custom;
            if (custom) {
                this.customBinds = [...custom];
            } else {
                this.customBinds = [];
            }
        };

        globalStorage.onChange('binds', (binds) => {
            applyBinds(binds as any);
        });

        // Apply initial binds from storage
        const initialBinds = globalStorage.get('binds');
        if (initialBinds) applyBinds(initialBinds as any);
    }

    setHelperConnection(helper: HelperConnection) {
        this.setupHelperListener(helper);
    }

    private setupHelperListener(helper: HelperConnection) {
        helper.onHotkey((msg: HotkeyMsg) => {
            this.handleHelperHotkey(msg);
        });
    }

    private handleHelperHotkey(msg: HotkeyMsg) {
        this.client.emit('helperHotkey', msg.id, msg.key);

        // Look up helper-specific binds from localStorage
        try {
            const raw = localStorage.getItem('arkadia.helperBinds');
            if (raw) {
                const helperBinds: { id: string; action: string; command?: string; targetBind?: string }[] = JSON.parse(raw);
                const match = helperBinds.find(b => b.id === msg.id);
                if (match) {
                    if (match.action === 'bind' && match.targetBind) {
                        this.executeBind(match.targetBind);
                    } else if (match.command) {
                        this.client.sendCommand(match.command);
                    }
                    return;
                }
            }
        } catch { /* ignore parse errors */ }
    }

    private executeBind(bindName: string) {
        this.client.emit('helperBind', bindName);
    }
}

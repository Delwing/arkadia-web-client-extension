import type Client from "./Client";
import { formatLabel } from "./functionalBind";
import { globalStorage } from "@modules/core/storage";
import { bindMatches } from "@modules/core/keymapTypes";
import { switchKeymap, getActiveKeymapId } from "@modules/core/keymapStorage";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import type { HotkeyMsg } from "@modules/helper/helperProtocol";
import { registerHelperBind } from "@modules/helper/helperBindRegistry";

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
        this.registerBuiltInHelperBinds();
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
                        this.client.sendCommand(`${this.client.attackCommand} ob_${id}`);
                    }
                    break;
                }
                case 'support': {
                    this.client.support();
                    break;
                }
                case 'temp1':
                    if (this.tempBinds[0]?.command) this.client.sendCommand(this.tempBinds[0].command);
                    break;
                case 'temp2':
                    if (this.tempBinds[1]?.command) this.client.sendCommand(this.tempBinds[1].command);
                    break;
            }
        });
    }

    private registerBuiltInHelperBinds() {
        registerHelperBind({ id: 'lamp', label: 'Napełnij lampę', category: 'Ogólne' });
        registerHelperBind({ id: 'attack', label: 'Atakuj', category: 'Walka' });
        registerHelperBind({ id: 'support', label: 'Wesprzyj', category: 'Walka' });
        registerHelperBind({ id: 'moveMode', label: 'Tryb ruchu', category: 'Ruch' });
        registerHelperBind({ id: 'functional', label: 'Funkcyjny', category: 'Ogólne' });
        registerHelperBind({ id: 'functionalGates', label: 'Funkcyjny (wrota)', category: 'Ogólne' });
        registerHelperBind({ id: 'functionalTransport', label: 'Funkcyjny (transport)', category: 'Ogólne' });
        registerHelperBind({ id: 'functionalLoot', label: 'Funkcyjny (zbieranie)', category: 'Ogólne' });
        registerHelperBind({ id: 'roomBind', label: 'Bind w lokacji', category: 'Ruch' });
        registerHelperBind({ id: 'drinkable', label: 'Napij się wody', category: 'Ogólne' });
        registerHelperBind({ id: 'temp1', label: 'Tymczasowe 1', category: 'Ogólne' });
        registerHelperBind({ id: 'temp2', label: 'Tymczasowe 2', category: 'Ogólne' });
        registerHelperBind({ id: 'enemy1', label: 'Atakuj wroga 1', category: 'Walka' });
        registerHelperBind({ id: 'enemy2', label: 'Atakuj wroga 2', category: 'Walka' });
        registerHelperBind({ id: 'enemy3', label: 'Atakuj wroga 3', category: 'Walka' });
        registerHelperBind({ id: 'enemyBlock1', label: 'Blokuj wroga 1', category: 'Walka' });
        registerHelperBind({ id: 'enemyBlock2', label: 'Blokuj wroga 2', category: 'Walka' });
        registerHelperBind({ id: 'enemyBlock3', label: 'Blokuj wroga 3', category: 'Walka' });
        registerHelperBind({ id: 'dir_n', label: 'Kierunek: N', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_s', label: 'Kierunek: S', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_w', label: 'Kierunek: W', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_e', label: 'Kierunek: E', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_nw', label: 'Kierunek: NW', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_ne', label: 'Kierunek: NE', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_sw', label: 'Kierunek: SW', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_se', label: 'Kierunek: SE', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_u', label: 'Kierunek: Góra', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_d', label: 'Kierunek: Dół', category: 'Kierunki' });
        registerHelperBind({ id: 'dir_special', label: 'Wyjście specjalne', category: 'Kierunki' });
    }

    setTempBind(index: number, command: string) {
        const bind = this.tempBinds[index];
        if (!bind) {
            return;
        }
        const trimmed = command.trim();
        bind.command = trimmed ? trimmed : null;
        const label = formatLabel(bind);
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
                    this.client.sendCommand(`${this.client.attackCommand} ob_${id}`);
                }
                ev.preventDefault();
            }
            if (bindMatches(ev, this.supportBind)) {
                this.client.support();
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
                if (!tb.command) {
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
            const temp = b?.temp;
            if (Array.isArray(temp)) {
                temp.forEach((tempBind: any, index: number) => {
                    if (!tempBind || typeof tempBind !== 'object') {
                        return;
                    }
                    if (typeof tempBind.key !== 'string' || tempBind.key === '') {
                        return;
                    }
                    const current = this.tempBinds[index];
                    if (current) {
                        current.key = tempBind.key;
                        current.ctrl = tempBind.ctrl ? true : undefined;
                        current.alt = tempBind.alt ? true : undefined;
                        current.shift = tempBind.shift ? true : undefined;
                    } else {
                        this.tempBinds[index] = {
                            key: tempBind.key,
                            ctrl: tempBind.ctrl ? true : undefined,
                            alt: tempBind.alt ? true : undefined,
                            shift: tempBind.shift ? true : undefined,
                            command: null,
                        };
                    }
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

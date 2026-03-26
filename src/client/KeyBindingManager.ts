import type Client from "./Client";
import { formatLabel } from "./scripts/functionalBind";
import { globalStorage } from "@modules/core/storage";
import { bindMatches } from "@modules/core/keymapTypes";

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
    customBinds: (BindConfig & { command: string })[] = [];
    tempBinds: (BindConfig & { command: string | null })[] = [
        { key: 'F4', command: null },
        { key: 'F5', command: null },
    ];

    private client: Client;

    constructor(client: Client) {
        this.client = client;
        this.setupKeydownListener();
        this.setupBindsListener();
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
}

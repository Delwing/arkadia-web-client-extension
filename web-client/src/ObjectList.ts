import Client from "@client/src/Client";
import { getItemSync, setItemSync } from "@client/src/storage";
import { COLOR_OBJECT, getColorLevel } from "./colors.ts";

export default class ObjectList {
    private client: Client;
    private readonly container: HTMLElement | null;
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private offsetLeft = 0;
    private offsetTop = 0;
    private pointerId = 0;
    private isMobile = false;

    constructor(client: Client) {
        this.client = client;
        this.container = document.getElementById("objects-list");
        this.isMobile = this.isMobileBrowser();
        this.setupDraggable();
        if (!this.isMobile) {
            this.container?.addEventListener("click", this.onClick);
        }
        window.addEventListener("resize", this.clampToViewport);
        this.client.addEventListener("gmcp.objects.nums", () => this.render());
        this.client.addEventListener("gmcp.objects.data", () => this.render());
        this.client.addEventListener("gmcp.char.state", () => this.render());
        this.render();
    }

    private setupDraggable() {
        if (!this.container) return;

        const savedData = getItemSync("objectsListPosition");
        const saved = savedData?.objectsListPosition;
        if (saved) {
            try {
                let { left, top, right, x, y } = saved as any;
                if (left === undefined && (right !== undefined || x !== undefined)) {
                    const oldRight = right ?? x ?? 0;
                    left = window.innerWidth - this.container.offsetWidth - oldRight;
                }
                top = top ?? y;
                if (typeof left === "number") {
                    this.container.style.left = `${left}px`;
                }
                if (typeof top === "number") {
                    this.container.style.top = `${top}px`;
                }
            } catch (e) {
                console.error("Error parsing saved objects list position", e);
            }
        }
        this.clampToViewport();

        this.container.addEventListener("pointerdown", this.onPointerDown);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
    }

    private onPointerDown = (e: PointerEvent) => {
        if (!this.container) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest(".object-num, .object-desc")) {
            return;
        }
        this.isDragging = true;
        this.pointerId = e.pointerId;
        this.startX = e.clientX;
        this.startY = e.clientY;
        const rect = this.container.getBoundingClientRect();
        this.offsetLeft = rect.left;
        this.offsetTop = rect.top;
        this.container.setPointerCapture(this.pointerId);
        e.preventDefault();
    };

    private onPointerMove = (e: PointerEvent) => {
        if (!this.isDragging || !this.container || e.pointerId !== this.pointerId) return;

        const deltaX = e.clientX - this.startX;
        const deltaY = e.clientY - this.startY;
        const newLeft = this.offsetLeft + deltaX;
        const newTop = this.offsetTop + deltaY;
        const maxLeft = window.innerWidth - this.container.offsetWidth;
        const clampedLeft = Math.min(maxLeft, Math.max(0, newLeft));
        const clampedTop = Math.max(0, newTop);
        this.container.style.left = `${clampedLeft}px`;
        this.container.style.top = `${clampedTop}px`;
    };

    private onPointerUp = (e: PointerEvent) => {
        if (!this.isDragging || !this.container || e.pointerId !== this.pointerId) return;
        this.isDragging = false;
        this.container.releasePointerCapture(this.pointerId);
        const rect = this.container.getBoundingClientRect();
        const position = {
            left: rect.left,
            top: rect.top,
        };
        setItemSync("objectsListPosition", position);
        this.clampToViewport();
    };

    private clampToViewport = () => {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        const styles = window.getComputedStyle(this.container);
        let newLeft = parseFloat(styles.left || "0");
        let newTop = parseFloat(styles.top || "0");

        const maxLeft = window.innerWidth - this.container.offsetWidth;

        if (rect.right > window.innerWidth) {
            newLeft = maxLeft;
        } else if (rect.left < 0) {
            newLeft = 0;
        }

        if (rect.bottom > window.innerHeight) {
            newTop = window.innerHeight - this.container.offsetHeight;
        } else if (rect.top < 0) {
            newTop = 0;
        }

        newLeft = Math.min(maxLeft, Math.max(0, newLeft));
        newTop = Math.max(0, newTop);
        this.container.style.left = `${newLeft}px`;
        this.container.style.top = `${newTop}px`;
    };

    private isMobileBrowser() {
        return (
            typeof navigator !== "undefined" &&
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            )
        );
    }

    private onClick = (e: MouseEvent) => {
        if (this.isMobile) return;
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const numEl = target.closest(".object-num[data-object-id]") as HTMLElement | null;
        if (numEl) {
            const id = numEl.getAttribute("data-object-id");
            if (id) {
                this.client.sendCommand(`zabij ob_${id}`);
            }
            return;
        }
        const descEl = target.closest(".object-desc[data-object-id]") as HTMLElement | null;
        if (descEl) {
            const id = descEl.getAttribute("data-object-id");
            const teammate = descEl.getAttribute("data-teammate") === "true";
            if (id) {
                const cmd = teammate ? `zaslon ob_${id}` : `zaslon przed ob_${id}`;
                this.client.sendCommand(cmd);
            }
        }
    };

    private render() {
        if (!this.container) return;
        const manager = this.client.ObjectManager;
        if (!manager) return;
        const objects = manager.getObjectsOnLocation();
        const descWidth = Math.max(0, ...objects.map((o: any) => (o.desc || "").length));
        const tm = this.client.TeamManager;
        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });
        const inCombat = objects.some(
            (o: any) => o.attack_num !== false && o.attack_num !== undefined
        );

        const lines = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            let prefix = "  ";
            if (obj.attack_target) {
                prefix = `<span style="color:orangered">>></span>`;
            } else if (obj.defense_target) {
                prefix = `<span style="color:greenyellow">>></span>`;
            }
            const numLabel = isPlayer
                ? `${prefix}${num}`
                : `${prefix}<span class="object-num" data-object-id="${obj.num}" data-object-num="${num}">${num}</span>`;
            const rawDesc = obj.desc || "";
            let coloredDesc = rawDesc;
            if (!isPlayer) {
                if (obj.avatar_target) {
                    coloredDesc = `<span style="color:#ffaaaa">${rawDesc}</span>`;
                } else if (tm?.isInTeam?.(rawDesc)) {
                    const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;
                    let style = "color:springgreen";
                    const classes = [] as string[];
                    if (teamAttacking && !isAttacking) {
                        classes.push("team-not-attacking");
                    }
                    const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
                    coloredDesc = `<span${classAttr} style="${style}">${rawDesc}</span>`;
                } else if (
                    typeof obj.state === "number" &&
                    obj.attack_num !== false &&
                    obj.attack_num !== undefined
                ) {
                    coloredDesc = `<span style="color:#b19cd9">${rawDesc}</span>`;
                }
            }
            const padding = " ".repeat(Math.max(0, descWidth - rawDesc.length));
            const isTeammate = tm?.isInTeam?.(rawDesc) ? "true" : "false";
            const desc = isPlayer
                ? `${rawDesc}${padding}`
                : `<span class="object-desc" data-object-id="${obj.num}" data-object-desc="${rawDesc}" data-teammate="${isTeammate}">${coloredDesc}</span>${padding}`;
            let bar = "";
            if (typeof obj.state === "number") {
                const hp = Math.max(0, Math.min(6, obj.state)) + 1;
                const colorLevel = getColorLevel(hp, 7, false, true);
                const color = COLOR_OBJECT[colorLevel];
                const filled = "#".repeat(hp);
                const empty = "-".repeat(7 - hp);
                bar = `[<span style="color:${color}">${filled}${empty}</span>]`;
            }
            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => o.shortcut);
            const arrow = attackers.length ? ` <- ${attackers.join(" ")}` : "";
            return `${numLabel} ${bar} ${desc}${arrow}`.trimEnd();
        });
        this.container.innerHTML = lines.join("<br>");
    }
}

import Client from "@client/src/Client";
import { getItemSync, setItemSync } from "@client/src/storage";

export default class ObjectList {
    private client: Client;
    private readonly container: HTMLElement | null;
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private offsetRight = 0;
    private offsetTop = 0;
    private pointerId = 0;

    constructor(client: Client) {
        this.client = client;
        this.container = document.getElementById("objects-list");
        this.setupDraggable();
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
                const { x, y } = saved as any;
                this.container.style.right = `${x}px`;
                this.container.style.top = `${y}px`;
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
        this.isDragging = true;
        this.pointerId = e.pointerId;
        this.startX = e.clientX;
        this.startY = e.clientY;
        const rect = this.container.getBoundingClientRect();
        this.offsetRight = window.innerWidth - rect.right;
        this.offsetTop = rect.top;
        this.container.setPointerCapture(this.pointerId);
        e.preventDefault();
    };

    private onPointerMove = (e: PointerEvent) => {
        if (!this.isDragging || !this.container || e.pointerId !== this.pointerId) return;

        const deltaX = this.startX - e.clientX;
        const deltaY = e.clientY - this.startY;
        const newRight = this.offsetRight + deltaX;
        const newTop = this.offsetTop + deltaY;
        const maxRight = window.innerWidth - this.container.offsetWidth;
        const clampedRight = Math.min(maxRight, Math.max(0, newRight));
        const clampedTop = Math.max(0, newTop);
        this.container.style.right = `${clampedRight}px`;
        this.container.style.top = `${clampedTop}px`;
    };

    private onPointerUp = (e: PointerEvent) => {
        if (!this.isDragging || !this.container || e.pointerId !== this.pointerId) return;
        this.isDragging = false;
        this.container.releasePointerCapture(this.pointerId);
        const rect = this.container.getBoundingClientRect();
        const position = {
            x: window.innerWidth - rect.right,
            y: rect.top,
        };
        setItemSync("objectsListPosition", position);
        this.clampToViewport();
    };

    private clampToViewport = () => {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        const styles = window.getComputedStyle(this.container);
        let newRight = parseFloat(styles.right || "0");
        let newTop = parseFloat(styles.top || "0");

        const maxRight = window.innerWidth - this.container.offsetWidth;

        if (rect.right > window.innerWidth) {
            newRight = 0;
        } else if (rect.left < 0) {
            newRight = maxRight;
        }

        if (rect.bottom > window.innerHeight) {
            newTop = window.innerHeight - this.container.offsetHeight;
        } else if (rect.top < 0) {
            newTop = 0;
        }

        newRight = Math.min(maxRight, Math.max(0, newRight));
        newTop = Math.max(0, newTop);
        this.container.style.right = `${newRight}px`;
        this.container.style.top = `${newTop}px`;
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

        const lines = objects.map((obj: any) => {
            const num = String(obj.shortcut)
            let prefix = "  ";
            if (obj.attack_target) {
                prefix = `<span style="color:orangered">>></span>`;
            } else if (obj.defense_target) {
                prefix = `<span style="color:greenyellow">>></span>`;
            }
            const numLabel = `${prefix}${num}`;
            const rawDesc = obj.desc || "";
            let coloredDesc = rawDesc;
            if (obj.avatar_target) {
                coloredDesc = `<span style="color:#ffaaaa">${rawDesc}</span>`;
            } else {
                if (tm?.isInTeam?.(rawDesc)) {
                    const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;
                    let style = "color:springgreen";
                    const classes = [] as string[];
                    if (teamAttacking && !isAttacking) {
                        classes.push("team-not-attacking");
                    }
                    const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
                    coloredDesc = `<span${classAttr} style="${style}">${rawDesc}</span>`;
                }
            }
            const desc = coloredDesc + " ".repeat(Math.max(0, descWidth - rawDesc.length));
            let bar = "";
            if (typeof obj.state === "number") {
                const hp = Math.max(0, Math.min(6, obj.state));
                const color = hp < 3 ? "tomato" : (hp < 4 ? "yellow" : "springgreen");
                const filled = "#".repeat(hp + 1);
                const empty = "-".repeat(6 - hp);
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

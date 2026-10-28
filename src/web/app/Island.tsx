import { Component, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface IslandProps {
    /** Shown in the console when the island fails. */
    name: string;
    /** Id of the page element to render into; omitted for components that portal themselves. */
    target?: string;
    children: ReactNode;
}

interface BoundaryState {
    failed: boolean;
}

/**
 * Keeps one failing part of the page from taking the rest with it. Each part
 * used to be its own React root, where a throw only emptied that root; under the
 * single app root an uncaught error would unmount everything, so every island
 * carries its own boundary.
 */
class IslandBoundary extends Component<{ name: string; children: ReactNode }, BoundaryState> {
    state: BoundaryState = { failed: false };

    static getDerivedStateFromError(): BoundaryState {
        return { failed: true };
    }

    componentDidCatch(error: unknown): void {
        console.error(`[app] ${this.props.name} failed to render`, error);
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}

/**
 * One part of the page under the app root: rendered into the page element with
 * the `target` id (as its own root used to be), or in place when it portals
 * itself. A missing target renders nothing, as the old `if (element)` guards did.
 */
export function Island({ name, target, children }: IslandProps) {
    const content = <IslandBoundary name={name}>{children}</IslandBoundary>;
    if (target === undefined) {
        return content;
    }
    const element = document.getElementById(target);
    return element ? createPortal(content, element) : null;
}

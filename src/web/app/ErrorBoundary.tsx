import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
    /** Shown in the console when the region fails. */
    name: string;
    children: ReactNode;
}

interface ErrorBoundaryState {
    failed: boolean;
}

/**
 * Keeps one failing region of the page from taking the rest with it: under the
 * single app root an uncaught error would otherwise unmount everything. The
 * region renders nothing once it has failed.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { failed: true };
    }

    componentDidCatch(error: unknown): void {
        console.error(`[app] ${this.props.name} failed to render`, error);
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}

import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
    /** Shown in the console when the region fails. */
    name: string;
    /**
     * Rendered in place of the region once it has failed. Without it the
     * region renders nothing, which suits a region inside a frame of its own;
     * a window whose only controls live in the failed region needs one, or it
     * is left empty with no way to close it.
     */
    fallback?: (error: unknown) => ReactNode;
    children: ReactNode;
}

interface ErrorBoundaryState {
    failed: boolean;
    error?: unknown;
}

/**
 * Keeps one failing region of the page from taking the rest with it: under the
 * single app root an uncaught error would otherwise unmount everything. The
 * region renders nothing (or its `fallback`) once it has failed.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return { failed: true, error };
    }

    componentDidCatch(error: unknown): void {
        console.error(`[app] ${this.props.name} failed to render`, error);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return this.props.fallback ? this.props.fallback(this.state.error) : null;
    }
}

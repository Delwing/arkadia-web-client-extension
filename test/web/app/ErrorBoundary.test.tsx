import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from '@web/app/ErrorBoundary';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): never {
    throw new Error('boom');
}

describe('ErrorBoundary', () => {
    let host: HTMLElement;
    let root: Root;

    beforeEach(() => {
        host = document.createElement('div');
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.restoreAllMocks();
    });

    it('renders its children', () => {
        act(() => root.render(<ErrorBoundary name="A"><span>hello</span></ErrorBoundary>));
        expect(host.innerHTML).toBe('<span>hello</span>');
    });

    it('keeps one failing region from unmounting the others', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        act(() => root.render(
            <>
                <ErrorBoundary name="Broken"><Boom /></ErrorBoundary>
                <ErrorBoundary name="Fine"><span>still here</span></ErrorBoundary>
            </>,
        ));
        expect(host.textContent).toBe('still here');
        expect(error).toHaveBeenCalledWith('[app] Broken failed to render', expect.any(Error));
    });
});

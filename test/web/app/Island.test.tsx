import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Island } from '@web/app/Island';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): never {
    throw new Error('boom');
}

describe('Island', () => {
    let host: HTMLElement;
    let root: Root;

    beforeEach(() => {
        document.body.innerHTML = '<div id="slot-a"></div><div id="slot-b"></div>';
        host = document.createElement('div');
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.restoreAllMocks();
    });

    it('renders into the element with the target id', () => {
        act(() => root.render(<Island name="A" target="slot-a"><span>hello</span></Island>));
        expect(document.getElementById('slot-a')!.innerHTML).toBe('<span>hello</span>');
        expect(host.innerHTML).toBe('');
    });

    it('renders in place without a target', () => {
        act(() => root.render(<Island name="A"><span>inline</span></Island>));
        expect(host.innerHTML).toBe('<span>inline</span>');
    });

    it('renders nothing when the target is missing', () => {
        act(() => root.render(<Island name="A" target="nope"><span>lost</span></Island>));
        expect(document.body.textContent).not.toContain('lost');
    });

    it('keeps one failing island from unmounting the others', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        act(() => root.render(
            <>
                <Island name="Broken" target="slot-a"><Boom /></Island>
                <Island name="Fine" target="slot-b"><span>still here</span></Island>
            </>,
        ));
        expect(document.getElementById('slot-a')!.innerHTML).toBe('');
        expect(document.getElementById('slot-b')!.textContent).toBe('still here');
        expect(error).toHaveBeenCalledWith('[app] Broken failed to render', expect.any(Error));
    });
});

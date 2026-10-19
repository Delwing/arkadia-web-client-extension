// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ColorInput } from '@web-ui/primitives/index.ts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

function pick(input: HTMLInputElement, color: string) {
    act(() => {
        valueSetter.call(input, color);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('ColorInput', () => {
    let container: HTMLDivElement;
    let root: Root;
    let onChange: ReturnType<typeof vi.fn<(color: string) => void>>;

    function render(value: string) {
        act(() => root.render(<ColorInput value={value} onChange={onChange} />));
        return container.querySelector('input')!;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        onChange = vi.fn<(color: string) => void>();
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
    });

    it('passes the first pick on at once', () => {
        const input = render('#000000');
        pick(input, '#ff0000');
        expect(onChange).toHaveBeenCalledExactlyOnceWith('#ff0000');
    });

    it('hands a drag on at most once per interval, ending with the last colour', () => {
        const input = render('#000000');
        pick(input, '#100000');
        pick(input, '#200000');
        pick(input, '#300000');
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(input.value).toBe('#300000');

        act(() => { vi.advanceTimersByTime(50); });
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenLastCalledWith('#300000');

        act(() => { vi.advanceTimersByTime(50); });
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('follows the owner once the drag has settled', () => {
        const input = render('#000000');
        pick(input, '#100000');
        act(() => { vi.advanceTimersByTime(100); });
        render('#abcdef');
        expect(input.value).toBe('#abcdef');
    });

    it('does not drop a pending colour when unmounted mid-drag', () => {
        const input = render('#000000');
        pick(input, '#100000');
        pick(input, '#200000');
        act(() => root.unmount());
        root = createRoot(container);
        expect(onChange).toHaveBeenLastCalledWith('#200000');
    });
});

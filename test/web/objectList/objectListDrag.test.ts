import { ObjectListDrag } from '@web/objectList/objectListDrag';
import { globalStorage } from '@modules/core/storage';

vi.mock('@modules/core/storage', async () => (await import('./support')).storageMockModule());

describe('ObjectListDrag', () => {
  beforeEach(() => {
    (globalStorage.get as jest.Mock).mockReset();
    (globalStorage.set as jest.Mock).mockReset();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  test('converts stored right position to left', () => {
    (globalStorage.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'objectsListPosition') return { x: 100, y: 50 };
      return undefined;
    });
    Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true });
    document.body.innerHTML = '<div id="objects-list"></div>';
    const container = document.getElementById('objects-list') as any;
    Object.defineProperty(container, 'offsetWidth', { value: 200, configurable: true });
    Object.defineProperty(container, 'offsetHeight', { value: 100, configurable: true });
    container.getBoundingClientRect = () => ({
      left: parseFloat(container.style.left || '0'),
      top: parseFloat(container.style.top || '0'),
      right: parseFloat(container.style.left || '0') + container.offsetWidth,
      bottom: parseFloat(container.style.top || '0') + container.offsetHeight,
      width: container.offsetWidth,
      height: container.offsetHeight,
    });
    new ObjectListDrag(container, false, () => 'list');
    expect(container.style.left).toBe('700px');
    expect(container.style.top).toBe('50px');
  });

  test('saves left position on pointer up', () => {
    (globalStorage.get as jest.Mock).mockReturnValue(undefined);
    document.body.innerHTML = '<div id="objects-list"></div>';
    const container = document.getElementById('objects-list') as any;
    Object.defineProperty(container, 'offsetWidth', { value: 200, configurable: true });
    Object.defineProperty(container, 'offsetHeight', { value: 100, configurable: true });
    container.getBoundingClientRect = () => ({
      left: 400,
      top: 60,
      right: 600,
      bottom: 160,
      width: 200,
      height: 100,
    });
    container.setPointerCapture = jest.fn();
    container.releasePointerCapture = jest.fn();
    const drag: any = new ObjectListDrag(container, false, () => 'list');
    const downEvent = {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      preventDefault: jest.fn(),
      target: container,
    } as unknown as PointerEvent;
    drag.onPointerDown(downEvent);
    drag.onPointerUp({ pointerId: 1 } as unknown as PointerEvent);
    expect(globalStorage.set).toHaveBeenCalledWith('objectsListPosition', { left: 400, top: 60 });
  });

  test('pointer down on object item does not start drag', () => {
    document.body.innerHTML = `<div id="objects-list"><div class="objects-list-content">
      <span class="object-num" data-object-num="1">1</span> <span class="object-desc" data-object-num="1">Goblin</span>
    </div></div>`;
    const container = document.getElementById('objects-list') as any;
    container.setPointerCapture = jest.fn();
    const drag: any = new ObjectListDrag(container, false, () => 'list');
    const num = document.querySelector('.object-num') as HTMLElement;
    const downEventNum = {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      target: num,
      preventDefault: jest.fn(),
    } as unknown as PointerEvent;
    drag.onPointerDown(downEventNum);
    expect(drag.isDragging).toBeFalsy();
    expect(container.setPointerCapture).not.toHaveBeenCalled();
    const desc = document.querySelector('.object-desc') as HTMLElement;
    const downEventDesc = {
      pointerId: 2,
      clientX: 0,
      clientY: 0,
      target: desc,
      preventDefault: jest.fn(),
    } as unknown as PointerEvent;
    drag.onPointerDown(downEventDesc);
    expect(drag.isDragging).toBeFalsy();
  });

  test('pointer down on a card does not start drag in card view', () => {
    document.body.innerHTML = '<div id="objects-list"><div class="object-card"><span class="spacer"></span></div></div>';
    const container = document.getElementById('objects-list') as any;
    container.setPointerCapture = jest.fn();
    const drag: any = new ObjectListDrag(container, false, () => 'card');
    drag.onPointerDown({
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 0,
      clientY: 0,
      target: document.querySelector('.spacer'),
      preventDefault: jest.fn(),
    } as unknown as PointerEvent);
    expect(drag.isDragging).toBeFalsy();
  });
});

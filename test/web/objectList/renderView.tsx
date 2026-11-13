import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ObjectListView } from '@web/objectList/views/index.tsx';
import type { ObjectListViewMode, RenderContext } from '@web/objectList/context';

/** Renders a node into a fresh container in the document and returns the container. */
export function renderNode(node: ReactNode): HTMLElement {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return container;
}

/** One object-list view, rendered; returns the container holding it. */
export function renderView(mode: ObjectListViewMode, ctx: RenderContext): HTMLElement {
  return renderNode(<ObjectListView mode={mode} ctx={ctx} />);
}

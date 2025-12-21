import { useEffect, useRef } from 'react';

interface ObjectListPanelProps {
  objectListElement: HTMLElement | null;
}

export function ObjectListPanel({ objectListElement }: ObjectListPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const originalParentRef = useRef<HTMLElement | null>(null);
  const originalStyleRef = useRef<{
    position: string;
    left: string;
    top: string;
    right: string;
    bottom: string;
    display: string;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current || !objectListElement) return;

    // Store original parent and styles for cleanup
    originalParentRef.current = objectListElement.parentElement;
    originalStyleRef.current = {
      position: objectListElement.style.position,
      left: objectListElement.style.left,
      top: objectListElement.style.top,
      right: objectListElement.style.right,
      bottom: objectListElement.style.bottom,
      display: objectListElement.style.display,
    };

    // Move object list element into our container
    containerRef.current.appendChild(objectListElement);

    // Reset positioning styles for docked mode
    objectListElement.style.position = 'relative';
    objectListElement.style.left = '';
    objectListElement.style.top = '';
    objectListElement.style.right = '';
    objectListElement.style.bottom = '';
    objectListElement.style.display = 'block';
    objectListElement.style.width = '100%';
    objectListElement.style.height = '100%';

    return () => {
      // Restore object list to original parent and styles on unmount
      if (originalParentRef.current && objectListElement && originalStyleRef.current) {
        originalParentRef.current.appendChild(objectListElement);
        objectListElement.style.position = originalStyleRef.current.position;
        objectListElement.style.left = originalStyleRef.current.left;
        objectListElement.style.top = originalStyleRef.current.top;
        objectListElement.style.right = originalStyleRef.current.right;
        objectListElement.style.bottom = originalStyleRef.current.bottom;
        objectListElement.style.display = originalStyleRef.current.display;
        objectListElement.style.width = '';
        objectListElement.style.height = '';
      }
    };
  }, [objectListElement]);

  return <div ref={containerRef} className="object-list-panel-container" />;
}

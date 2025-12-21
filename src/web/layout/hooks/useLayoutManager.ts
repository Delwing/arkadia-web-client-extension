import { useContext } from 'react';
import { LayoutContext, LayoutContextValue } from '../LayoutContext';

export function useLayoutManager(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutManager must be used within a LayoutProvider');
  }
  return context;
}

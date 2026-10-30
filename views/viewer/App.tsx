import { useState, useEffect } from 'react';
import type { ViewerComponentProps } from './types.ts';

/**
 * Generic plugin viewer shell.
 *
 * Loads a plugin-provided React component from a URL or inline code
 * and renders it. The plugin component handles everything else
 * (connections, UI, data).
 *
 * URL params:
 *   ?module=<url>          - URL to a JS module that default-exports a React component
 *   ?code=<base64>         - Base64-encoded JS code that default-exports a React component
 *
 * All other URL params are forwarded to the loaded component via the `params` prop.
 */
export default function App() {
  const [Component, setComponent] = useState<React.ComponentType<ViewerComponentProps> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const moduleUrl = params.get('module');
    const inlineCode = params.get('code');

    if (!moduleUrl && !inlineCode) {
      setError('Missing "module" or "code" URL parameter.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        let mod: any;
        if (moduleUrl) {
          mod = await import(/* @vite-ignore */ moduleUrl);
        } else if (inlineCode) {
          const decoded = atob(inlineCode);
          const blob = new Blob([decoded], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          try {
            mod = await import(/* @vite-ignore */ url);
          } finally {
            URL.revokeObjectURL(url);
          }
        }

        const Comp = mod?.default || mod;
        if (typeof Comp !== 'function') {
          setError('Module does not export a valid React component.');
          setLoading(false);
          return;
        }
        setComponent(() => Comp);
      } catch (err) {
        setError('Failed to load module: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="viewer-status">
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="viewer-status">
        <div style={{ color: '#d9534f', maxWidth: 500, textAlign: 'center' }}>{error}</div>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="viewer-status">
        <span>No component loaded.</span>
      </div>
    );
  }

  const params = new URLSearchParams(window.location.search);
  return <Component params={params} />;
}

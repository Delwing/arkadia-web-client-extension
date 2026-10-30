import React from 'react';
import ReactDOM from 'react-dom/client';
import * as ReactDOMModule from 'react-dom';
import App from './App.tsx';
import './viewer.css';

// Expose React on the global scope so plugin-provided viewer modules
// can use React without bundling it themselves.
(window as any).React = React;
(window as any).ReactDOM = ReactDOMModule;

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

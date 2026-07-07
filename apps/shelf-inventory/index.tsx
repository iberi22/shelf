import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { initSentry } from './lib/sentry';

// Initialize offline-capable Sentry
initSentry();

const FallbackComponent = () => (
  <div style={{ padding: '20px', fontFamily: 'sans-serif', textAlign: 'center', marginTop: '50px' }}>
    <h2>¡Ups! Algo salió mal.</h2>
    <p>Hemos registrado el error (incluso si estás offline, se enviará luego).</p>
    <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', marginTop: '10px' }}>
      Recargar Página
    </button>
  </div>
);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={FallbackComponent}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);

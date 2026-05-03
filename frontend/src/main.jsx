import React from 'react';
import ReactDOM from 'react-dom/client';
import './auto-refresh-on-update.js';
import './select-and-screen-persistence.js';
import './topbar-inventory-button.js';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import './styles.css';
import './folder-trade-player-hotfix.css';
import './dashboard-faq-topbar-hotfix.css';
import './auction-rewrite-v2.css';
import './trade-click-hotfix.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

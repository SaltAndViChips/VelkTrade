import React from 'react';
import ReactDOM from 'react-dom/client';
import './auto-refresh-on-update.js';
import './select-and-screen-persistence.js';
import './topbar-inventory-button.js';
import './activity-notification-poller.js';
import './trade-buy-offer-alerts.js';
import './persistent-auction-alerts.js';
import './inventory-escrow-controls.js';
import './bulk-select-event-guard.js';
import './auction-first-bid-minimum-hotfix.js';
import './admin-test-view-mode.js';
import './public-bazaar-route.js';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import './styles.css';
import './folder-trade-player-hotfix.css';
import './dashboard-faq-topbar-hotfix.css';
import './auction-rewrite-v2.css';
import './inventory-escrow-controls.css';
import './persistent-auction-alerts.css';
import './admin-economy-testview.css';
import './admin-test-view-mode.css';
import './folder-export-actions.css';
import './folder-tools-modern.css';
import './inventory-modern-popout.css';
import './buy-offer-v2.css';
import './dashboard-trade-badge.css';
import './public-bazaar-route.css';
import './trade-click-hotfix.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

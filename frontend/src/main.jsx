import React from 'react';
import ReactDOM from 'react-dom/client';
import './folder-hover-select-stabilizer.js';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import './styles.css';
import './folder-trade-player-hotfix.css';
import './trade-click-hotfix.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

import './styles/global.css';
import './styles/components.css';
import './styles/sidebar.css';
import './styles/stats.css';
import './styles/pipeline-controls.css';
import './styles/cve-table.css';
import './styles/detail-panel.css';
import './styles/views.css';
import './styles/feedback-widget.css';
import './styles/scanner-findings-view.css';
import './styles/pipeline-health-view.css';
import './styles/theme-refresh.css';
import './styles/stat-cards.css';
import './styles/inline-detail-row.css';
import './styles/github-pr.css';
import './styles/pipeline-run-steps.css';
import './styles/fix-prs-view.css';
import './styles/scanner-findings-section.css';
import './styles/scanner-findings-batch.css';
import './styles/scanner-findings-severity.css';
import './styles/scanner-findings-batch-polish.css';
import './styles/push-scan-pr.css';
import './styles/force-push.css';
import './styles/scanner-stats.css';
import './styles/detected-repo.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { CveExplorerView } from './views/CveExplorerView';
import { LearningView } from './views/LearningView';
import { ScannerFindingsView } from './views/ScannerFindingsView';
import { PipelineHealthView } from './views/PipelineHealthView';

export function App() {
  const [view, setView] = useState('cves');
  const [selectedCveId, setSelectedCveId] = useState(null);

  return (
    <div className="app-shell">
      <Sidebar activeView={view} onNavigate={setView} />

      <main className="app-main">
        {view === 'cves' && <CveExplorerView onSelectCve={setSelectedCveId} selectedCveId={selectedCveId} />}
        {view === 'learning' && <LearningView />}
        {view === 'scanner-findings' && <ScannerFindingsView />}
        {view === 'pipeline-health' && <PipelineHealthView />}
      </main>
    </div>
  );
}

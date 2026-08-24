import { useState } from 'react';
import { ingestionApi } from '../api/ingestionApi';
import { analysisApi } from '../api/analysisApi';
import { riskApi } from '../api/riskApi';
import { remediationApi } from '../api/remediationApi';

const STAGES = [
  { key: 'ingest', label: 'Trigger ingestion', action: () => ingestionApi.triggerIngestion('NVD') },
  { key: 'analyze', label: 'Trigger analysis', action: () => analysisApi.triggerBatch() },
  { key: 'score', label: 'Trigger risk scoring', action: () => riskApi.triggerBatch() },
  { key: 'remediate', label: 'Trigger remediation', action: () => remediationApi.triggerBatch() },
];

/**
 * Manually kicks each pipeline stage's async /trigger endpoint - useful for
 * demos and smoke tests rather than waiting for each service's cron. Every
 * trigger endpoint returns immediately (202 Accepted) and runs in the
 * background, so this just reports "triggered", not completion.
 */
export function PipelineControls() {
  const [pending, setPending] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  async function handleTrigger(stage) {
    setPending(stage.key);
    setLastResult(null);
    try {
      await stage.action();
      setLastResult({ key: stage.key, ok: true });
    } catch (err) {
      setLastResult({ key: stage.key, ok: false, message: err.message });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="card pipeline-controls">
      <div className="pipeline-controls__header">
        <span className="pipeline-controls__title">Pipeline controls</span>
        <span className="pipeline-controls__hint">Runs each stage's scheduled job on demand</span>
      </div>
      <div className="pipeline-controls__buttons">
        {STAGES.map((stage) => (
          <button
            key={stage.key}
            className="button"
            onClick={() => handleTrigger(stage)}
            disabled={pending !== null}
          >
            {pending === stage.key ? 'Triggering…' : stage.label}
          </button>
        ))}
      </div>
      {lastResult && (
        <div className={`pipeline-controls__result ${lastResult.ok ? 'pipeline-controls__result--ok' : 'pipeline-controls__result--error'}`}>
          {lastResult.ok
            ? `${STAGES.find((s) => s.key === lastResult.key)?.label} started.`
            : `Failed: ${lastResult.message}`}
        </div>
      )}
    </div>
  );
}

const config = require('../config/config');
const cveRepository = require('../repository/cveRepository');
const analysisRepository = require('../repository/analysisRepository');
const { SYSTEM_PROMPT, buildUserPrompt, PROMPT_VERSION } = require('../prompts/cveAnalysisPrompt');
const { invokeWithFallback } = require('../bedrock/bedrockClient');
const { parseAnalysisResponse } = require('../bedrock/responseParser');
const { runWithConcurrency } = require('./concurrency');
const { analysisTotal, batchDuration, batchSize: batchSizeGauge } = require('../metrics/metrics');

/**
 * Analyzes a single CVE record (already fetched from the DB) and persists
 * the result. Never throws - failures are recorded as a FAILED row so a bad
 * CVE doesn't stop the rest of a batch, and gets retried on the next run.
 */
async function analyzeCve(cve) {
  const userPrompt = buildUserPrompt(cve);

  try {
    const { modelId, text } = await invokeWithFallback(SYSTEM_PROMPT, userPrompt);
    const parsed = parseAnalysisResponse(text);

    await analysisRepository.upsertAnalysis({
      cveId: cve.cve_id,
      ...parsed,
      modelId,
      promptVersion: PROMPT_VERSION,
      status: 'SUCCESS',
      rawResponse: text,
    });

    analysisTotal.inc({ status: 'SUCCESS' });
    return { cveId: cve.cve_id, status: 'SUCCESS' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[analysis] failed for ${cve.cve_id}: ${err.message}`);
    await analysisRepository.upsertAnalysis({
      cveId: cve.cve_id,
      status: 'FAILED',
      errorMessage: err.message?.slice(0, 2000),
    });
    analysisTotal.inc({ status: 'FAILED' });
    return { cveId: cve.cve_id, status: 'FAILED', error: err.message };
  }
}

/** Analyzes one CVE by ID, fetching it fresh from the DB. Used by the on-demand API route. */
async function analyzeCveById(cveId) {
  const cve = await cveRepository.findByCveId(cveId);
  if (!cve) {
    const err = new Error(`CVE ${cveId} not found`);
    err.statusCode = 404;
    throw err;
  }
  return analyzeCve(cve);
}

/**
 * Pulls up to `batchSize` CVEs needing analysis (new or changed since last
 * analysis, highest CVSS first) and runs them with bounded concurrency so
 * Bedrock throughput/cost stays predictable.
 */
async function runBatch(batchSize = config.analysis.batchSize) {
  const stopTimer = batchDuration.startTimer();
  try {
    const candidates = await cveRepository.findCvesNeedingAnalysis(batchSize);
    batchSizeGauge.set(candidates.length);

    if (candidates.length === 0) {
      return { fetched: 0, succeeded: 0, failed: 0 };
    }

    const results = await runWithConcurrency(candidates, config.analysis.concurrency, analyzeCve);

    const succeeded = results.filter((r) => r.status === 'SUCCESS').length;
    const failed = results.length - succeeded;

    // eslint-disable-next-line no-console
    console.log(`[analysis] batch complete: fetched=${candidates.length} succeeded=${succeeded} failed=${failed}`);
    return { fetched: candidates.length, succeeded, failed };
  } finally {
    stopTimer();
  }
}

module.exports = { analyzeCve, analyzeCveById, runBatch };

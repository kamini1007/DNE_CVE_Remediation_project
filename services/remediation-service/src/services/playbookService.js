// Standard vuln-management SLA windows by risk level - fairly common industry
// defaults (CRITICAL same-day, HIGH within a few days, etc.), overridable
// later via config if an org has stricter/looser SLAs.
const DUE_BY_HOURS = {
  CRITICAL: 24,
  HIGH: 72,
  MEDIUM: 336, // 2 weeks
  LOW: 720, // 30 days
};

const OWNER_BY_STEP_TYPE = {
  AI_RECOMMENDATION: 'Security Team',
  VERIFICATION: 'Infrastructure Team',
  CLOSURE: 'Security Team',
};

/**
 * Builds a structured playbook: the AI's own remediation recommendations
 * (already ordered by priority from Phase 3) become the first steps, then
 * two standard operational steps (verify + close) are appended so every
 * playbook is actionable end-to-end, not just "here's what's wrong."
 */
function buildPlaybook(scoredCve) {
  const { cveId, riskLevel, exploitabilityLevel, potentialImpact, remediationRecommendations } = normalize(scoredCve);

  const dueByHours = DUE_BY_HOURS[riskLevel] || DUE_BY_HOURS.MEDIUM;

  const aiSteps = (remediationRecommendations || []).map((rec, index) => ({
    order: index + 1,
    action: rec.step,
    priority: rec.priority,
    owner: OWNER_BY_STEP_TYPE.AI_RECOMMENDATION,
  }));

  const nextOrder = aiSteps.length + 1;
  const steps = [
    ...aiSteps,
    {
      order: nextOrder,
      action: `Verify the remediation is effective (re-scan or confirm patched version deployed for ${cveId})`,
      priority: 'HIGH',
      owner: OWNER_BY_STEP_TYPE.VERIFICATION,
    },
    {
      order: nextOrder + 1,
      action: `Close out tracking once verified and update the risk register for ${cveId}`,
      priority: 'MEDIUM',
      owner: OWNER_BY_STEP_TYPE.CLOSURE,
    },
  ];

  return {
    summary: buildSummary(cveId, riskLevel, exploitabilityLevel, potentialImpact),
    urgency: riskLevel,
    dueByHours,
    steps,
  };
}

function buildSummary(cveId, riskLevel, exploitabilityLevel, potentialImpact) {
  const impactClause = potentialImpact ? ` ${potentialImpact}` : '';
  return `${cveId} is rated ${riskLevel} risk with ${exploitabilityLevel} exploitability.${impactClause}`.trim();
}

/** Defensively handles both camelCase (JS-native) and snake_case (raw pg row) field names. */
function normalize(scoredCve) {
  return {
    cveId: scoredCve.cveId || scoredCve.cve_id,
    riskLevel: scoredCve.riskLevel || scoredCve.risk_level || 'MEDIUM',
    exploitabilityLevel: scoredCve.exploitabilityLevel || scoredCve.exploitability_level || 'UNKNOWN',
    potentialImpact: scoredCve.potentialImpact || scoredCve.potential_impact || null,
    remediationRecommendations: scoredCve.remediationRecommendations || scoredCve.remediation_recommendations || [],
  };
}

module.exports = { buildPlaybook };

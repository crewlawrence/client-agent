export function shouldUseLLM({ tenant, changeCount, isScheduledRun }) {
  const mode = tenant.llm_mode || 'meaningful';
  const minChangeCount = Number(tenant.llm_min_change_count ?? 2);

  if (mode === 'never') return false;
  if (mode === 'always') return true;
  if (mode === 'scheduled') return isScheduledRun && changeCount >= minChangeCount;
  // meaningful (default)
  return changeCount >= minChangeCount;
}

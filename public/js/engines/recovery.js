const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const scoreScale = (value, low, high) => clamp(((value - low) / (high - low)) * 100, 0, 100);

export function calculateRecovery(checkin, settings = {}, history = []) {
  if (!checkin) {
    return {
      score: null,
      confidence: 0,
      components: [],
      flags: ['missing_checkin']
    };
  }

  const baseline = Number(settings?.athlete?.restingHrBaseline) || inferRhrBaseline(history);
  const components = [];
  const flags = [];

  if (Number.isFinite(Number(checkin.sleepHours))) {
    const hours = Number(checkin.sleepHours);
    const score = hours >= 8 ? 100 : hours >= 7 ? 88 : hours >= 6 ? 68 : hours >= 5 ? 42 : 18;
    components.push({ key: 'sleepHours', score, weight: 0.24, value: hours });
    if (hours < 6) flags.push('short_sleep');
  }

  if (Number.isFinite(Number(checkin.sleepQuality))) {
    const quality = clamp(Number(checkin.sleepQuality), 1, 5);
    components.push({ key: 'sleepQuality', score: scoreScale(quality, 1, 5), weight: 0.12, value: quality });
    if (quality <= 2) flags.push('poor_sleep_quality');
  }

  if (Number.isFinite(Number(checkin.restingHr)) && baseline) {
    const restingHr = Number(checkin.restingHr);
    const deltaPct = ((restingHr - baseline) / baseline) * 100;
    const score = deltaPct <= 0 ? 100 : deltaPct <= 3 ? 86 : deltaPct <= 6 ? 65 : deltaPct <= 10 ? 40 : 18;
    components.push({ key: 'restingHr', score, weight: 0.20, value: restingHr, baseline, deltaPct: Number(deltaPct.toFixed(1)) });
    if (deltaPct >= 7) flags.push('elevated_resting_hr');
  }

  if (Number.isFinite(Number(checkin.hrvMs)) && Number(checkin.hrvMs) > 0) {
    const hrvBaseline = inferHrvBaseline(history);
    if (hrvBaseline) {
      const deltaPct = ((Number(checkin.hrvMs) - hrvBaseline) / hrvBaseline) * 100;
      const score = deltaPct >= 0 ? 100 : deltaPct >= -8 ? 82 : deltaPct >= -15 ? 58 : 30;
      components.push({ key: 'hrv', score, weight: 0.16, value: Number(checkin.hrvMs), baseline: hrvBaseline, deltaPct: Number(deltaPct.toFixed(1)) });
      if (deltaPct <= -15) flags.push('suppressed_hrv');
    }
  }

  for (const [key, weight] of [['fatigue', 0.14], ['stress', 0.10], ['muscleSoreness', 0.08]]) {
    if (!Number.isFinite(Number(checkin[key]))) continue;
    const value = clamp(Number(checkin[key]), 1, 5);
    const score = 100 - scoreScale(value, 1, 5);
    components.push({ key, score, weight, value });
    if (value >= 4) flags.push(`high_${key}`);
  }

  if (checkin.illnessSymptoms) flags.push('illness_symptoms');
  if (checkin.unusualDizziness) flags.push('unusual_dizziness');

  if (!components.length) return { score: null, confidence: 0, components, flags: [...flags, 'missing_metrics'] };
  const totalWeight = components.reduce((total, item) => total + item.weight, 0);
  const score = components.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight;
  const confidence = Math.round(clamp((components.length / 7) * 75 + (checkin.source !== 'manual' ? 20 : 0), 20, 100));

  return {
    score: Math.round(score),
    confidence,
    components,
    flags: [...new Set(flags)],
    baseline: { restingHr: baseline || null, hrvMs: inferHrvBaseline(history) || null }
  };
}

export function inferRhrBaseline(history = []) {
  const values = history
    .filter(item => Number(item.restingHr) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 14)
    .map(item => Number(item.restingHr));
  return median(values);
}

export function inferHrvBaseline(history = []) {
  const values = history
    .filter(item => Number(item.hrvMs) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 21)
    .map(item => Number(item.hrvMs));
  return median(values);
}

function median(values) {
  if (values.length < 3) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

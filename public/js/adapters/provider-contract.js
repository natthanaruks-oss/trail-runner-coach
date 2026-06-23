/**
 * Provider adapter contract for Garmin, Suunto, Apple Health companion or
 * another source. Provider-specific payloads must be normalized before they
 * enter IndexedDB or any scoring engine.
 */
export class HealthProviderAdapter {
  constructor(providerId) {
    this.providerId = providerId;
  }

  async authorize() {
    throw new Error(`${this.providerId}: authorize() is not implemented`);
  }

  async sync() {
    throw new Error(`${this.providerId}: sync() is not implemented`);
  }

  normalizeActivity(_payload) {
    throw new Error(`${this.providerId}: normalizeActivity() is not implemented`);
  }

  normalizeDailyMetrics(_payload) {
    throw new Error(`${this.providerId}: normalizeDailyMetrics() is not implemented`);
  }
}

export function assertNormalizedActivity(activity) {
  const required = ['id', 'date', 'source', 'durationMin'];
  const missing = required.filter(key => activity?.[key] == null);
  if (missing.length) throw new Error(`Normalized activity is missing: ${missing.join(', ')}`);
  return activity;
}

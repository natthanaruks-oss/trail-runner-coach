# Sync Guard Report v2.5.0

- Strava Worker and OAuth code are unchanged.
- Existing Apple Health Shortcut JSON remains accepted.
- Apple Health Worker adds auto-detection and normalization for Health Auto Export JSON v2.
- Existing APPLE_HEALTH_BRIDGE_TOKEN and APPLE_HEALTH_ENCRYPTION_KEY are preserved during the upgrade deploy.
- Existing APPLE_HEALTH_DATA KV namespace and encrypted records are preserved.
- Workouts are not imported from Health Auto Export in the recommended configuration, avoiding duplication with Strava.
- IndexedDB remains version 4.

# Personal Score Calibration

## Purpose

Trail Runner Coach v1.8 calibrates Strain, Recovery and Readiness against the athlete's own repeated feedback. It is an explainable decision-support layer, not a diagnosis or injury-prediction system.

## Daily workflow

1. Complete Daily Readiness Check.
2. Train, rest or modify the planned session.
3. Open **Strain & Recovery → Personal Score Calibration**.
4. Record actual readiness (1–5), optional perceived Strain (0–21), session outcome and optional note.
5. The feedback becomes eligible for the following day's score.

One feedback record is stored per date under the existing IndexedDB `metadata` store using the ID prefix `scoreCalibrationFeedback:`.

## Calibration phases

| Phase | Usable readiness feedback | Behavior |
|---|---:|---|
| Bootstrap | 0–6 days | Base formula; feedback is collected but changes are strongly shrunk |
| Learning | 7–20 days | Small bounded score and component-weight adjustments |
| Personalized | 21+ days | Full bounded adjustment with continuing gradual updates |

## Models

### Readiness offset

The system compares the predicted Readiness snapshot with the user's actual 1–5 answer, mapped to 15/35/55/75/95. A robust median residual is multiplied by a learning factor and capped at ±10 points.

### Strain offset

Optional perceived Strain is compared with the predicted 0–21 score. The robust residual is capped at ±2.5 points and never changes the underlying stored activity load.

### Recovery component weights

When at least seven usable samples contain component snapshots, the relationship between each component and actual readiness is estimated. Resulting modifiers are shrinkage-limited to 0.85×–1.15× base weights.

### RHR and HRV baseline

- Resting HR: up to 28 recent values
- HRV: up to 42 recent values
- Center: median
- Spread: MAD × 1.4826 with safe minimum spreads

This reduces the effect of a single abnormal wearable measurement.

## Safety and governance

Calibration is applied before safety caps. The following remain authoritative:

- pain ≥6/10;
- pain during walking;
- altered gait;
- swelling/redness/unusual heat;
- illness symptoms;
- unusual dizziness or chest symptoms.

Calibration cannot override Red or Yellow pain gates. Users may disable or reset calibration without deleting health, workout, nutrition or pain data.

## Data compatibility

No IndexedDB schema upgrade is required. Existing v1.x data and backups remain compatible. Calibration feedback is included automatically in JSON backups because it uses the existing metadata store.

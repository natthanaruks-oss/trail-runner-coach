# Strain, Recovery and Readiness scoring

The scores are provider-neutral decision-support signals. They are not medical diagnosis, injury prediction, or a replacement for professional assessment.

## Strain — 0 to 21

Daily Strain combines two sources:

1. **Recorded exercise**
   - Internal load: `duration × session RPE`.
   - When RPE is missing, average HR relative to the athlete's Max HR estimates an RPE band.
   - Mechanical modifiers: distance, elevation gain, elevation loss, trail terrain and night running.
   - Descent has a slightly higher mechanical weight because trail descending adds eccentric braking demand.

2. **Daily behavior**
   - Steps, Active Energy and Exercise Minutes are compared with the athlete's recent median.
   - Behavior contributes on rest days and is capped on workout days to reduce double-counting.

The underlying load is mapped to a 0–21 curve. The UI also keeps a normalized 0–100 value for charts only.

Suggested interpretation:

- `<4`: light
- `4–7.9`: moderate
- `8–12.9`: high
- `13–16.9`: very high
- `17–21`: peak load

These bands describe workload, not whether the workload is automatically good or bad.

## Recovery — 0 to 100

Recovery compares the current day with the athlete's own baseline:

- Sleep duration relative to personal sleep target
- Sleep quality
- Resting HR deviation
- HRV deviation
- Fatigue, stress and muscle soreness
- Previous-day and recent three-day Strain

RHR baseline uses recent values with a minimum of 3 days. HRV baseline requires at least 5 days and becomes more reliable toward 21 days. Missing fields reduce Data Confidence rather than being treated as normal.

Suggested interpretation:

- `75–100`: good recovery
- `50–74`: moderate recovery
- `<50`: recovery is limited

## Readiness — 0 to 100

Readiness combines Recovery with:

- Pain Safety Gate
- 7-day load trend
- Subjective pain/fatigue completion
- Available activity history

Wearable-only data is capped at Yellow until the user completes pain, fatigue, stress and soreness questions.

## Safety gates

The following can force or cap the recommendation regardless of HRV or sleep:

- Pain at 6/10 or higher
- Pain during normal walking
- Altered gait
- Swelling, redness or unusual heat
- Illness symptoms
- Unusual dizziness or chest-related symptoms

Pain 3–5/10 or recurring pain creates a Yellow caution and can remove speed, downhill or long-run work.

## Confidence and explainability

Every score includes Data Confidence and drivers. Confidence reflects:

- Objective metric coverage
- Subjective check completion
- RHR/HRV baseline maturity
- Workout and behavior data availability
- Data source such as Apple Health, import or manual entry

The score detail page shows positive and negative drivers, 14-day trends and baseline maturity.

## Personal calibration — v1.8

Calibration learns only from explicit user feedback and uses guarded limits. It does not train a black-box medical model.

### Feedback fields

- Actual readiness: 1–5, mapped to 15/35/55/75/95
- Perceived total Strain: optional 0–21
- Session outcome: rest/not trained, easier, as expected, harder, or stopped
- Optional notes

The score snapshot shown on the feedback date is stored with the answer. Feedback from a date begins affecting the next date, avoiding same-day self-fitting.

### Learning phases

- **Bootstrap (0–6 usable readiness days):** scores remain close to the transparent base formula.
- **Learning (7–20):** small, shrinkage-limited adjustments begin.
- **Personalized (21+):** full bounded calibration is allowed and continues to update gradually.

### Guardrails

- Readiness correction is capped at ±10 points.
- Strain correction is capped at ±2.5 on the 0–21 scale.
- Recovery component weights can move only between 0.85× and 1.15× their base weight.
- Pain, illness, walking pain, altered gait, swelling and dizziness caps are applied after calibration. Calibration can never turn a safety Red into Green.
- Calibration can be disabled or reset without deleting workouts, health metrics, food logs or pain history.

### Robust personal baselines

RHR uses up to 28 recent values and HRV up to 42. A median and median-absolute-deviation spread are used, with safe minimum spreads. After enough history, deviations are interpreted against the athlete's own normal variability rather than only fixed population-style percentage bands.

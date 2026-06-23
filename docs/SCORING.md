# Scoring and safety logic

The app provides training decision support, not diagnosis or injury prediction.

## Strain

Training strain combines session RPE × duration with mechanical factors such as distance, elevation gain, elevation loss, trail terrain and night running. Daily behavior load uses available steps, active energy and exercise minutes relative to personal history.

## Recovery

Recovery uses available sleep, sleep quality, resting HR deviation, HRV context, fatigue, stress and muscle soreness. Missing fields reduce confidence rather than being silently interpreted as normal.

## Readiness

Readiness combines recovery, recent load, behavior load and pain safety gates. A wearable-only check-in is capped at Yellow until subjective pain/safety questions are completed.

## Safety gates

Pain at 6/10 or higher, pain while walking, altered gait, swelling, illness symptoms or unusual dizziness can force a Red recommendation. Yellow may replace hard sessions with easy work or reduce duration and distance.

Scores must remain explainable: the UI should show flags, confidence and the reason for a recommendation rather than presenting a single opaque number.

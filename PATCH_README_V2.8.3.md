# v2.8.3 patch — Wake-day recovery alignment

## Purpose

Use last night's recovery data as today's readiness input for the full day.

## Core rule

For Health Auto Export only:

- Sleep, Resting HR and HRV source date `D` are applied to readiness date `D + 1`.
- Steps, active energy, exercise minutes and walking/running distance remain on date `D`.

## User experience

- Daily Readiness labels overnight values as “เมื่อคืน · ใช้กับวันนี้ทั้งวัน”.
- Today can show an automatic readiness preview before the user completes subjective questions.
- Morning/evening workouts update load but do not replace or remove the overnight recovery input.

## Traceability

The app preserves both provider source date and effective readiness date. No historical source record is rewritten.

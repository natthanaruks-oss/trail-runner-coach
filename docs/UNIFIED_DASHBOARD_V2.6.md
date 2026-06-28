# Unified Health & Training Dashboard — v2.6.0

## Product intent

The primary experience is organized around athlete decisions, not provider names.

Today answers four questions:

1. How ready am I?
2. Is recent training load balanced?
3. Is energy and fueling supportive?
4. What should I do today?

## Today information hierarchy

1. Daily Readiness hero
2. Recovery / Training Load / Energy & Fuel pillars
3. Unified Health Snapshot
4. Explainable Coach Insight
5. Race, weekly progress, food, water and recent activities

## Source handling

Provider metadata remains stored for audit, deduplication and diagnostics. It is displayed only under Data & Sync or advanced record details. The main Today and Health pages do not group metrics by provider.

## Core logic

- Recovery uses the existing recovery engine.
- Training Load Balance evaluates current 7-day load against recent 28-day equivalent load and weekly change.
- Energy & Fuel combines available recovery, daily movement and complete-day energy balance components.
- Every score contains a confidence value and explainable contributors.
- Missing metrics remain visible as missing; they are not fabricated.
- Sleep, Resting HR and HRV use the latest non-null value and retain the actual data date.

## Drill-down

The Health & Recovery page provides 7-day and 28-day trends for:

- Sleep
- Resting HR
- HRV
- Steps
- Active Energy
- Walking + Running Distance

It also shows contributors, training context and data-quality confidence.

## Safety

The dashboard is training guidance only. Pain safety gates from the existing readiness engine remain authoritative and are not overridden by visual scores.

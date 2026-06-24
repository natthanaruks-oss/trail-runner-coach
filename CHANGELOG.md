# Changelog

## 1.2.1 — Typography & Bevel-inspired UI polish

- Replaced the mixed Inter/fallback stack with native Apple/Thai/Windows system fonts for consistent offline rendering.
- Normalized font weights and minimum label sizes to prevent synthetic or unusually small text.
- Rebuilt primary navigation icons as inline SVG so they do not depend on symbol fonts.
- Refined cards, rings, spacing, tab controls, forms and bottom navigation with a cleaner health-dashboard visual language.
- Kept all v1.2.0 Strain, Recovery, Readiness, food logging, rehab and legacy workflows unchanged.
- Bumped application and PWA cache version to 1.2.1.

## 1.2.0 — Strain & Recovery Engine

- Added three visible daily scores: Strain 0–21, Recovery 0–100 and Readiness 0–100.
- Added a provider-neutral daily Strain model combining workout load, trail mechanical load, downhill, night running and Apple Health behavior metrics.
- Added personalized Recovery baselines for Sleep target, Resting HR and HRV with baseline maturity and Data Confidence.
- Added previous-day and three-day Strain context to Recovery.
- Added a detailed score page with 14-day trends, positive/negative drivers and transparent calculation notes.
- Kept Pain Safety Gate above all wearable scores and retained the wearable-only Yellow cap until subjective checks are complete.
- Added athlete sleep-target setting and expanded automated tests to 16.
- Preserved every v1.1 food, training, plan, log and migration workflow.
- Bumped PWA cache and application version to 1.2.0.

## 1.1.0 — Legacy Feature Parity

- Restored the five primary workflows: Today, Plan, Train, Food and Log.
- Restored the legacy food workflow with 449 searchable food records, categories, recent foods, portion selection, custom foods, daily edit/delete and water tracking.
- Added user overrides so catalog foods can be edited, hidden and reset without modifying the bundled source catalog.
- Added complete-day flags and 7/14/30-day energy-balance trends.
- Added BMR, activity-factor, protein and hydration settings while prioritizing adequate fueling during Build/Peak.
- Restored Rehab, Strength, Running Drills and home-equipment tracking.
- Consolidated Motivation, Pain, Body/Weight, Sleep/RHR and Data access under Log.
- Expanded legacy backup migration for food, custom foods, water, sleep, RHR, weight and equipment.
- Added IndexedDB stores for food logs, custom food/overrides, water and daily flags; database schema is now version 4.
- Bumped PWA cache and application version to 1.1.0.

## 1.0.2 — Node 22 build runtime

- Updated Cloudflare build runtime to Node.js 22.16.0.
- Pinned Wrangler to 4.103.0.

## 1.0.1 — Cloudflare deployment name

- Changed the Cloudflare Worker name to `trail-runner-coaches`.

## 1.0.0 — Trail Runner Coach foundation

- Introduced multi-race profiles, IndexedDB, adaptive readiness engines and Apple Health bridge foundation.

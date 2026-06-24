# Changelog

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

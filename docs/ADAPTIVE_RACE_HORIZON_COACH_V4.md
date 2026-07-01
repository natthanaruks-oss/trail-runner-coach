# Adaptive Race Horizon Coach v4.0.0

This release plans backward from the active race and the exact number of days remaining. It adds a deterministic Race Horizon model, capability evidence, feasibility classification, a dynamic block, and a contextual daily mission.

Key controls:
- no fixed one-year assumption;
- large gaps are marked buildable, partial, race-strategy, or unsafe to chase;
- pain and Local Coach safety decisions remain authoritative;
- AI receives the deterministic horizon and mission but cannot increase training;
- the Home AI cache key is tied to the complete snapshot digest, fixing stale advice after material data changes;
- Race Priority A/B/C and Goal type are stored in the Race Profile;
- no new bottom navigation item is added.

The Roadmap route is reachable from the Race page and the Today mission card.

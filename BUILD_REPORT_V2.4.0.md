# Build Report — Trail Runner Coach v2.4.0

## Result

- Repository verification: passed
- Automated tests: 62/62 passed
- Cloudflare deploy dry-run: passed
- Static assets read: 76
- npm audit: 0 vulnerabilities
- Node syntax checks: passed
- IndexedDB version: unchanged at 4

## New functionality

- Apple Health metrics visible on Today
- Apple Health 7-day averages and data coverage
- Explicit mapping into Strain, Recovery, Readiness and calorie targets
- Pull Latest action on Today
- Advanced setup collapsed after Bridge configuration
- Active Energy calorie logic avoids double-counting the non-exercise activity factor

## Risk controls

- Both Worker implementations are unchanged
- Provider sync and Apple Health import adapters are unchanged
- No secrets, tokens or user health data are included in the package
- No database migration is required

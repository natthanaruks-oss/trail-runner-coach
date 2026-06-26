# Apple Health Shortcuts Bridge

## Purpose

This bridge lets the iPhone Shortcuts app read selected Health samples and send a daily summary to Trail Runner Coach. It is a separate Cloudflare Worker and does not modify the existing Strava Worker, OAuth tokens, KV bindings, routes or activity records.

Recommended source ownership:

- **Strava:** workouts, distance, duration, elevation and activity heart rate.
- **Apple Health Shortcut:** sleep, resting heart rate, HRV, steps, active energy, exercise minutes, walking/running distance, weight and body fat.

Do not send workouts through the Shortcut while Strava is connected. This keeps one canonical workout and avoids duplicate activities.

## Architecture

```text
Apple Health
  -> iPhone Shortcut
  -> Apple Health Shortcut Worker (separate)
  -> encrypted KV record
  -> Trail Runner Coach pulls /v1/sync
  -> existing Apple Health normalizer and dedup engine
```

The Worker encrypts the complete health payload with AES-GCM before writing it to Cloudflare KV. The bridge token and encryption key are Worker secrets.

## Step 1: Deploy the separate Worker

From GitHub Codespaces, in the project root:

```bash
npm install
npm run setup:apple-health-shortcut
```

Accept the suggested values unless your app URL or Worker name is different.

The script will:

1. Check Cloudflare login.
2. Create the `APPLE_HEALTH_DATA` KV namespace.
3. Generate `APPLE_HEALTH_BRIDGE_TOKEN` and `APPLE_HEALTH_ENCRYPTION_KEY`.
4. Deploy `trail-runner-coach-apple-health-sync`.
5. Add the Worker origin to `connect-src` in `public/_headers`.
6. Create `apple-health-shortcut-setup-result.local.json`.

The `.local.json` file contains the bridge token. It is excluded by `.gitignore`. Never commit or share it.

Commit only the source/config changes:

```bash
git add package.json package-lock.json public workers scripts docs examples test .gitignore
git commit -m "Add Apple Health Shortcuts bridge"
git push
```

## Step 2: Import the setup result into the app

Open:

```text
More -> Devices & Connections -> Apple Health -> Set up Shortcut
```

Import `apple-health-shortcut-setup-result.local.json`, then tap **Save and test**.

After the app confirms that the bridge is ready, copy:

- POST URL
- Bearer Token

You need both when building the iPhone Shortcut.

## Step 3: Build the iPhone Shortcut

Create a new Shortcut named:

```text
TRC Apple Health Sync
```

### A. Current date

1. Add **Current Date**.
2. Add **Format Date**.
3. Use custom format `yyyy-MM-dd`.
4. Rename the output `HealthDate`.

### B. Read Health values

Add one **Find Health Samples** action for each required type. Filter by the relevant period and sort newest first.

Recommended minimum:

| Health type | Filter | Value to send |
|---|---|---|
| Resting Heart Rate | Date is today or latest | bpm |
| Heart Rate Variability (SDNN) | Date is today or latest | ms |
| Steps | Date is today | daily total |
| Active Energy | Date is today | kcal total |
| Exercise Time | Date is today | minute total |
| Walking + Running Distance | Date is today | km total |
| Body Mass | latest | kg |
| Body Fat Percentage | latest | percentage |

For sleep, use sleep samples covering the last night and calculate the total duration in hours. Depending on the iOS version and data source, sleep may be split into Core, Deep and REM samples. Sum asleep phases and do not add “In Bed” if asleep phases are already available.

Use Magic Variables or **Get Details of Health Samples** to select the numeric quantity from each action. Use the calculation/statistics actions available in Shortcuts to total lists such as steps and active energy.

### C. Build the JSON Dictionary

Add a **Dictionary** action with the same field names as `examples/apple-health-shortcut-payload.example.json`.

Top-level keys:

- `source` = `apple_health`
- `exportedAt` = Current Date formatted as ISO 8601
- `dailyMetric` = Dictionary
- `bodyComposition` = Dictionary

`dailyMetric` keys:

- `date`
- `sleepHours`
- `restingHr`
- `hrvMs`
- `activeEnergyKcal`
- `steps`
- `exerciseMinutes`
- `walkingRunningDistanceKm`
- `sourceDevice` = `Apple Shortcuts`

`bodyComposition` keys:

- `date`
- `weightKg`
- `percentBodyFat`
- `sourceDevice` = `Apple Shortcuts`

A field may be omitted when Health has no value. Do not send zero merely because a sample is missing.

### D. Send to the Worker

Add **Get Contents of URL**:

- URL: copy the POST URL from the app.
- Method: `POST`
- Request Body: `JSON`
- JSON: the Dictionary created above.
- Header `Authorization`: `Bearer ` followed by the bridge token.
- Header `Content-Type`: `application/json`

Add **Show Notification** at the end, for example:

```text
Apple Health sent to Trail Runner Coach
```

On the first run, iOS will ask permission to read the selected Health categories and permission to connect to the Worker URL.

## Step 4: Test end to end

1. Run `TRC Apple Health Sync` on the iPhone.
2. Confirm the success notification.
3. Open Trail Runner Coach.
4. Go to Apple Health Shortcut.
5. Tap **Pull latest data**.
6. Verify Sleep, RHR, HRV, Steps and body metrics in the app.
7. Verify that Strava activities remain connected and are not duplicated.

## Step 5: Automate

Create a Personal Automation in Shortcuts:

- Trigger: a morning time after sleep data is normally available.
- Action: Run `TRC Apple Health Sync`.
- Turn off confirmation only if iOS allows it for the selected Health actions.

The Shortcut sends data to the bridge. Trail Runner Coach pulls the latest data when opened or when **Pull latest data** is tapped.

## Security and privacy

- Health data leaves the iPhone and is stored in the user’s Cloudflare account.
- The stored payload is AES-GCM encrypted before KV storage.
- The setup result and Shortcut contain a bearer token. Anyone with the token could read or overwrite the bridge data.
- Never place the token in GitHub, screenshots, chat messages or shared Shortcut links.
- Delete `apple-health-shortcut-setup-result.local.json` after setup, or keep it only in a secure password-protected location.
- Normal app exports remove the Apple Health bridge token by default.

## Rollback

The Apple Health bridge can be removed without changing Strava:

1. Delete the `trail-runner-coach-apple-health-sync` Worker and its KV namespace.
2. Clear Apple Health Shortcut settings in the app.
3. Remove only the Apple Health Worker origin from `connect-src` if desired.

Do not delete or redeploy `trail-runner-coach-wearable-sync` as part of this rollback.

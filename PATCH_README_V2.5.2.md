# Trail Runner Coach v2.5.2 Patch

Fixes Apple Health records exported with Thai Buddhist Era dates such as `2569-06-27`.

The Apple Health Worker now converts Buddhist Era years to Gregorian years for:
- new Health Auto Export payloads;
- existing encrypted records already stored in KV;
- ISO timestamps used by body composition records.

The browser adapter also performs a defensive date conversion before writing IndexedDB.

This patch does not change the Strava Worker, OAuth credentials, Bridge Token, encryption key, KV binding or IndexedDB schema.

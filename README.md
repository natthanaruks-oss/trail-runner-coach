# Trail Runner Coach

Local-first adaptive trail running coach สำหรับใช้งานระยะยาวหลายสนาม โดยรวมแผนซ้อม ผลจริง Strain, Recovery, Readiness, Pain/Rehab, อาหาร พลังงาน น้ำดื่ม Gear, Body Composition และการเชื่อมข้อมูลจาก wearable ไว้ในระบบเดียว

## Version 1.3.0 — Food Expansion, Deficit Filters, Connections & Smooth UI

รุ่นนี้รักษาเมนูและ workflow จาก v1.2.1 ทั้งหมด แล้วเพิ่ม 4 เรื่องตามการใช้งานจริง:

1. ขยายฐานอาหารไทยปรุงสำเร็จเป็น **1,824 รายการรวม**
2. เพิ่มการวิเคราะห์ **Calories deficit/surplus ตามช่วงวันที่ที่เลือก**
3. เพิ่มศูนย์เชื่อมต่อ **Apple Health, Garmin, Suunto และ Strava**
4. ปรับ state/rendering ให้บันทึกข้อมูลแล้วหน้าจอไม่กระพริบและไม่เด้งขึ้นบนโดยไม่จำเป็น

เมนูหลักยังคงเป็น:

1. **วันนี้** — Dashboard, Readiness, Strain/Recovery, อาหารและน้ำวันนี้
2. **แผน** — Multi-race training plan และบันทึกผลจริง
3. **ฝึก** — Rehab, Strength, Running Drills และอุปกรณ์ฝึกที่บ้าน
4. **อาหาร** — Food log, Energy balance, Nutrition guide, Race fueling และ HR Zones
5. **บันทึก** — Motivation, Pain, Body/Weight, Sleep/RHR, Connections และ Data tools

## Food logging 1,824 รายการ

- Legacy catalog เดิม 449 รายการยังอยู่ครบ
- เพิ่ม Thai prepared-food dataset 1,375 รายการแบบ lazy-load เมื่อเปิดตัวเลือกอาหาร
- ค้นหาจากชื่อไทย ชื่ออังกฤษ และหมวดย่อย
- ตัวกรอง: ล่าสุด, ข้าว, เส้น, แกง/ต้ม, ผัด/ทอด/ย่าง, ภูมิภาค/ยำ, ของหวาน, เครื่องดื่ม, เมนูเดิม, โปรตีน, ของว่าง, ของวิ่ง และเมนูส่วนตัว
- อาหารชุดใหม่คำนวณตามน้ำหนักกรัม โดยมีปุ่ม 50/100/150/200/250 กรัมและช่องกรอกเอง
- รองรับสร้าง/แก้ไข/ลบเมนูส่วนตัว, catalog overrides, recent foods, daily edit/delete และ water tracker เหมือนเดิม

ค่าพลังงานในชุดอาหาร 1,375 รายการเป็น **estimated per 100 g** เพื่อใช้ติดตามแนวโน้ม ไม่ใช่ผลตรวจห้องปฏิบัติการหรือคำแนะนำทางการแพทย์

## Calories deficit filters

หน้าอาหาร → พลังงาน รองรับ:

- Quick filters 7 / 14 / 30 / 90 วัน
- Custom start date และ end date
- Deficit total, surplus total และ net after offset
- จำนวนวันที่กรอกครบ, coverage %, deficit days และ surplus days
- Average deficit และ theoretical weight trend
- ป้องกันการสรุป deficit จากวันที่กรอกอาหารไม่ครบ โดยนับเฉพาะวันที่ทำเครื่องหมายว่า “บันทึกครบทั้งวัน”
- แจ้งเตือนเมื่อ coverage ต่ำ หรือ deficit เฉลี่ยสูงเกินไปสำหรับการฟื้นตัว

## Strain / Recovery / Readiness

- **Strain 0–21:** Workout duration × RPE/HR ร่วมกับระยะ, Gain/Loss, Trail, Night Run และพฤติกรรมจาก Steps/Active Energy/Exercise Minutes
- **Recovery 0–100:** Sleep, Resting HR, HRV, Fatigue, Stress, Soreness และ Strain 1–3 วันก่อน เทียบ baseline ส่วนตัว
- **Readiness 0–100:** Recovery ร่วมกับ Pain Safety Gate และแนวโน้มโหลด โดย Pain มีสิทธิ์เหนือคะแนนเสมอ
- หน้า Strain & Recovery แสดงเหตุผลของคะแนน, Data Confidence, Baseline maturity และแนวโน้ม 14 วัน

## Wearable connections

### Apple Health

Apple Health เป็นแหล่งหลักผ่าน iOS Companion App ภายใต้ `ios/TrailRunnerCoach` เพราะ browser/PWA อ่าน HealthKit โดยตรงไม่ได้ ตัว companion ใช้ SwiftUI + HealthKit + WKWebView เพื่อส่งข้อมูลที่ผู้ใช้อนุญาตเข้า normalized schema ของเว็บแอป

### Garmin / Suunto / Strava

หน้า **บันทึก → เชื่อมต่อ** รองรับการกำหนด Wearable Sync Worker URL และมี flow Connect / Sync / Disconnect แยกตาม provider

- **Strava:** Worker มี OAuth, token refresh, webhook endpoint และการดึง recent activities พร้อม normalize แล้ว ต้องตั้ง API credentials ก่อนใช้งานจริง
- **Garmin:** OAuth/security boundary พร้อม แต่การดึง Health/Activity จริงต้องใช้สิทธิ์และเอกสาร endpoint ที่ได้รับหลังผ่าน Garmin Developer Program
- **Suunto:** OAuth/security boundary พร้อม แต่ workout/FIT mapping ต้องใช้สิทธิ์ partner และ endpoint ที่บัญชีได้รับ
- Client secret และ refresh token ไม่ถูกเก็บใน browser; Worker เข้ารหัส token ก่อนเก็บใน KV

ดูรายละเอียดที่ `docs/WEARABLE_INTEGRATION.md` และ `workers/wearable-sync/README.md`

## Smooth interaction changes

- การบันทึกรายการย่อยอัปเดต in-memory state โดยตรง แทนการอ่าน IndexedDB ทุก store ใหม่ทั้งระบบ
- Same-route updates รักษาตำแหน่ง scroll เดิม
- แต่ละ route จำตำแหน่ง scroll แยกกัน
- ตัด unconditional `window.scrollTo(0, 0)` ที่เคยทำให้หน้ากระโดด
- ใช้ manual history scroll restoration และ stable scrollbar
- เปลี่ยนเฉพาะส่วนที่จำเป็นโดยไม่แสดง loading-opacity ทุกครั้ง

## Product principles

- **Athlete first:** Pain และ Recovery สามารถลดโหลดได้โดยไม่ถือว่าการพักคือความล้มเหลว
- **Feature continuity:** ห้ามตัด workflow ที่ผู้ใช้ใช้งานจริงโดยไม่มี migration และ parity review
- **Multi-race:** `RaceProfile` แยกจาก `TrainingPlan`; RTC 70 เป็นเพียง initial profile
- **Local-first:** ข้อมูลหลักเก็บใน IndexedDB และ Export/Import เป็น JSON
- **Provider-neutral:** Apple Health, Garmin, Suunto, Strava, GPX/TCX/CSV และ Manual normalize เข้า schema กลาง
- **Explainable:** Strain/Readiness แสดงปัจจัยและ confidence; ไม่ใช่การวินิจฉัยทางการแพทย์

## Repository structure

```text
public/                    Cloudflare static web app / PWA
  data/                    Thai prepared-food dataset
  js/core/                 IndexedDB, store, nutrition, race and plan logic
  js/engines/              strain, recovery, readiness, recommendation
  js/adapters/             Apple Health, provider sync, file import, legacy migration
  js/data/                 food loaders, training library, plan and guides
  js/views/                modular route-level UI

ios/TrailRunnerCoach/      SwiftUI + HealthKit companion app
workers/wearable-sync/     optional Garmin/Suunto/Strava OAuth and webhook Worker
test/                      unit and browser integration tests
docs/                      architecture, parity, schema and integration notes
scripts/                   repository verification
```

## Development

Requires **Node.js 22.16.0 or newer**.

```bash
npm clean-install
npm test
npm run check
npm run dev
```

Cloudflare deploy:

```bash
npm run deploy
```

`wrangler.jsonc` deploys `./public` to Worker **`trail-runner-coaches`** with SPA fallback.

### Cloudflare workaround when npm automatic install fails

```text
SKIP_DEPENDENCY_INSTALL=true
Build command: leave blank, or echo "No build step"
Deploy command: pnpm dlx wrangler@4.103.0 deploy
Root directory: /
```

Do not enter the literal word `None` in Build command.

## Legacy migration

The app imports old `roadtopyc70` backups and migrates plan completion, actual workouts, readiness, sleep, RHR, pain, food logs, custom foods, water, weight and equipment. New backups include every IndexedDB store.

## Apple Health local build

On macOS:

```bash
brew install xcodegen
cd ios/TrailRunnerCoach
xcodegen generate
open TrailRunnerCoach.xcodeproj
```

Set a unique Bundle ID, select an Apple Development Team, confirm HealthKit capability, and test on a physical iPhone.

## Privacy

Do not commit Apple Health exports, InBody files, FIT/TCX/GPX, app backups, OAuth tokens, `.env`, signing data or other personal health information. The deploy package contains no user health data.

## Visual system

The UI uses native system fonts so Thai and English remain consistent in the PWA and offline mode. Typography, rings and navigation follow a clean connected-health visual language while retaining Trail Runner Coach branding and workflows.

# Trail Runner Coach

Local-first adaptive trail running coach สำหรับใช้งานระยะยาวหลายสนาม โดยรวมแผนซ้อม ผลจริง Strain, Recovery, Readiness, Pain/Rehab, อาหาร พลังงาน น้ำดื่ม Gear และ Body Composition ไว้ในระบบเดียว

## Version 1.1 — Legacy Feature Parity

รุ่นนี้นำ workflow ที่ใช้งานจริงจาก `roadtopyc70` กลับมาเขียนใหม่บนสถาปัตยกรรม Modular + IndexedDB โดยไม่ย้อนกลับไปใช้ `index.html` ไฟล์เดียว

เมนูหลัก:

1. **วันนี้** — Dashboard, Readiness, Strain/Recovery, อาหารและน้ำวันนี้
2. **แผน** — Multi-race training plan และบันทึกผลจริง
3. **ฝึก** — Rehab, Strength, Running Drills และอุปกรณ์ฝึกที่บ้าน
4. **อาหาร** — Food log, Energy balance, Nutrition guide, Race fueling และ HR Zones
5. **บันทึก** — Motivation, Pain, Body/Weight, Sleep/RHR และ Data tools

### Food workflow ที่คืนกลับมา

- ฐานอาหารเดิม 449 รายการ พร้อมค้นหาและหมวดหมู่
- รายการล่าสุด, ปรับ portion, เพิ่ม/แก้ไข/ลบรายการประจำวัน
- สร้างและจัดการเมนูส่วนตัว
- แก้ไขหรือซ่อนเมนูในฐานเดิมได้โดยสร้าง user override โดยไม่ทำลาย source catalog
- Water tracker และเครื่องหมาย “บันทึกครบทั้งวัน”
- Calories, Protein, Carb, Fat และ Energy balance ย้อนหลัง 7/14/30 วัน
- เป้าพลังงานปรับตามแผนซ้อม/กิจกรรม/Apple Health โดยไม่ใช้เป็นคำสั่งเร่งลดน้ำหนักช่วง Build/Peak

ค่าพลังงานใน legacy food catalog เป็น **estimated serving values** เพื่อใช้ติดตามแนวโน้ม ไม่ใช่ผลตรวจห้องปฏิบัติการ

## Product principles

- **Athlete first:** Pain และ Recovery สามารถลดโหลดได้โดยไม่ถือว่าการพักคือความล้มเหลว
- **Feature continuity:** ห้ามตัด workflow ที่ผู้ใช้ใช้งานจริงโดยไม่มี migration และ parity review
- **Multi-race:** `RaceProfile` แยกจาก `TrainingPlan`; RTC 70 เป็นเพียง initial profile
- **Local-first:** ข้อมูลเก็บใน IndexedDB และ Export/Import เป็น JSON
- **Provider-neutral:** Apple Health, Garmin, Suunto, GPX/TCX/CSV และ Manual normalize เข้า schema กลาง
- **Explainable:** Strain/Readiness แสดงปัจจัยและ confidence; ไม่ใช่การวินิจฉัยทางการแพทย์

## Repository structure

```text
public/                    Cloudflare static web app / PWA
  js/core/                 IndexedDB, store, nutrition, race and plan logic
  js/engines/              strain, recovery, readiness, recommendation
  js/adapters/             Apple Health, file import, legacy migration
  js/data/                 food catalog, training library, plan and guides
  js/views/                modular route-level UI
ios/TrailRunnerCoach/      SwiftUI + HealthKit companion app
workers/wearable-sync/     optional Garmin/Suunto OAuth scaffold
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

Current project configuration may use:

```text
SKIP_DEPENDENCY_INSTALL=true
Build command: leave blank, or echo "No build step"
Deploy command: pnpm dlx wrangler@4.103.0 deploy
Root directory: /
```

Do not enter the literal word `None` in Build command.

## Legacy migration

The app imports old `roadtopyc70` backups and migrates:

- plan completion and actual workouts
- readiness, sleep and resting HR
- pain/niggle history
- food logs, custom foods and water
- weight history and basic settings
- home-training equipment

New backups include every IndexedDB store, including food, custom-food overrides, water and daily completion flags.

## Apple Health

Safari/PWA cannot read HealthKit directly. The companion app under `ios/TrailRunnerCoach` uses SwiftUI + HealthKit + WKWebView and passes normalized data to the web app on-device.

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

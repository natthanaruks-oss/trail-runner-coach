# Trail Runner Coach

Local-first adaptive trail running coach สำหรับใช้งานระยะยาวหลายสนาม รองรับ **ภาษาไทยและ English** พร้อมแผนซ้อม ผลจริง Strain, Recovery, Readiness, Pain/Rehab, อาหาร พลังงาน น้ำดื่ม Gear, Body Composition และการเชื่อมข้อมูลจาก wearable ในระบบเดียว

## Version 2.2.0 — Mobile App UX & Navigation

รุ่นนี้ปรับแอปให้ใช้งานบนมือถือเหมือนแอปจริง โดย **ไม่เปลี่ยนระบบ Sync, Worker, OAuth, KV, IndexedDB หรือข้อมูลเดิม**:

- เมนูหลักใหม่: **วันนี้ / แผน / ฝึก / อาหาร / เพิ่มเติม**
- หน้า **เพิ่มเติม** แบ่งหมวดสุขภาพ ข้อมูล อุปกรณ์ การแข่งขัน และการตั้งค่า
- หน้า **อุปกรณ์และการเชื่อมต่อ** แบบสั้นสำหรับดูสถานะและกด Sync ประจำวัน
- Setup Wizard, Worker URL, KV, Secrets และ Retry Queue ย้ายไปอยู่หน้า **การตั้งค่าขั้นสูง**
- หน้า Health Journal ไม่ Render Connections Wizard ทั้งหมดอีกต่อไป จึงโหลดเบาและเลื่อนสั้นลง
- ป้องกัน Auto Zoom ของช่องกรอกบนมือถือด้วยขนาดตัวอักษร 16px
- รองรับ Safe Area, `100dvh`, Bottom Sheet Modal และป้องกัน Horizontal Scroll
- ลด Blur และ Shadow บนมือถือเพื่อให้เลื่อนลื่นขึ้น
- เพิ่ม PWA/Standalone metadata สำหรับเปิดจาก Home Screen แบบเต็มหน้าจอ
- IndexedDB ยังคง schema version 4 และข้อมูลเดิมใช้ต่อได้ทันที
- Wearable Worker และ Sync adapters ไม่ถูกแก้ไขในรุ่นนี้

## Version 2.1.0 — Google Health / Fitbit Sync

รุ่นนี้เพิ่มการเชื่อมข้อมูลจาก **Google Health API** สำหรับ Fitbit และ ecosystem ของ Google โดยใช้ Cloudflare Wearable Sync Worker เดิมร่วมกับ Strava และรักษาฟีเจอร์ v2.0.0 ทั้งหมด:

- เพิ่ม Google Health / Fitbit Setup Wizard ใน **บันทึก → เชื่อมต่อ**
- เพิ่มคำสั่งเดียว `npm run setup:google-health` สำหรับเตรียม KV, ตั้ง OAuth secrets และ Deploy Worker
- ใช้ Google OAuth 2.0 แบบ offline access พร้อม encrypted refresh-token storage
- Sync Exercise, Sleep, Resting HR, HRV, Steps, Active Energy, Active Minutes, Distance, Weight และ Body Fat
- ข้อมูลทุกประเภทถูกแปลงเข้า provider-neutral schema ก่อนคำนวณ Strain, Recovery และ Readiness
- Workout จาก Google Health/Fitbit ผ่าน Cross-provider Deduplication เพื่อไม่ให้นับซ้ำกับ Strava, Apple Health หรือไฟล์นำเข้า
- การ Sync บาง data type ล้มเหลวจะไม่ทำให้ข้อมูลประเภทอื่นที่อ่านได้ถูกทิ้ง และแสดง warning ตรวจสอบได้
- Auto Sync, Last Sync, Retry Queue และ Activity Integrity รองรับ `google_health`
- รองรับภาษาไทยและ English โดยไม่เปลี่ยน IndexedDB schema
- Client Secret และ refresh token ไม่ถูกฝังใน Public Web Bundle หรือ setup receipt

การเชื่อมบัญชีจริงต้องมี Google Cloud OAuth credentials ของผู้ใช้และตั้ง Authorized redirect URI ตาม Worker ที่ Deploy แล้ว

รายละเอียด: `docs/GOOGLE_HEALTH_FITBIT.md`

## Version 2.0.0 — Encrypted Cloud Backup

รุ่นนี้ทำ **Step 6 ของ Integration Roadmap** และปิดวงจร Local-first ด้วย Cloud Backup แบบเข้ารหัสจากฝั่งผู้ใช้ก่อนอัปโหลด:

- เพิ่มหน้า **Encrypted Cloud Backup** จาก Data & Wearables และเมนูเพิ่มเติม
- เข้ารหัส Snapshot ทั้งหมดด้วย AES-GCM-256 หลัง derive key ด้วย PBKDF2-SHA-256
- Passphrase ไม่ออกจาก Browser และไม่อยู่ใน Recovery Kit
- Cloudflare Worker เก็บเฉพาะ encrypted blob, metadata ขั้นต่ำ และ SHA-256 token hash
- เก็บย้อนหลัง 3–30 versions พร้อม prune รายการเก่าอัตโนมัติ
- Restore ได้ทั้ง Merge และ Replace พร้อม preview จำนวนข้อมูลก่อนยืนยัน
- Recovery Kit สำหรับเชื่อมอุปกรณ์ใหม่ โดยยังต้องใช้ Passphrase เพื่อถอดรหัส
- Auto Backup เมื่อเปิดแอป/กลับมาออนไลน์ หากเลือก Remember key on this device
- เพิ่มคำสั่งเดียว `npm run setup:backup` เพื่อสร้าง KV และ Deploy Worker
- ไม่เปลี่ยน IndexedDB schema และไม่ตัดฟีเจอร์เดิม

รายละเอียด: `docs/ENCRYPTED_CLOUD_BACKUP.md`

## Version 1.9.0 — Progress Dashboard

รุ่นนี้ทำ **Step 5 ของ Integration Roadmap** โดยรวมข้อมูลที่กระจายอยู่หลายหน้าให้เป็นมุมมองเดียวสำหรับตัดสินใจปรับแผน:

- เพิ่มหน้า **Progress Dashboard** เปิดจากหน้า Today หรือแท็บ **บันทึก → ความก้าวหน้า**
- Filter 7 / 28 / 90 วัน และช่วงวันที่กำหนดเองสูงสุด 366 วัน
- เทียบช่วงปัจจุบันกับช่วงก่อนหน้าที่มีจำนวนวันเท่ากัน
- สรุประยะวิ่ง/เดิน, Vertical gain, เวลาซ้อม, Plan adherence, Recovery และ Calories balance
- กราฟระยะและ Vertical จริงเทียบแผน โดยใช้กิจกรรมที่ผ่าน Cross-provider Deduplication
- กราฟ Strain, Recovery และ Readiness ในสเกลเดียวกันเพื่อดูแนวโน้ม
- รวม Pain trend, Energy balance, Green/Yellow/Red days และ Data coverage
- สร้าง Insight แบบ explainable เช่น Load เพิ่มเร็ว, Recovery ต่ำ, Pain สูงขึ้น หรือ Deficit มากเกินไป
- แยกกิจกรรมวิ่ง/เดิน/Hike ออกจาก Cycling และ Strength เพื่อไม่ให้ระยะรวมเพี้ยน
- รองรับภาษาไทยและ English และรักษาตำแหน่ง scroll เมื่อเปลี่ยน Filter
- ไม่เปลี่ยน IndexedDB schema และไม่ตัดฟีเจอร์เดิม

รายละเอียด: `docs/PROGRESS_DASHBOARD.md`

## Version 1.8.0 — Personal Score Calibration

รุ่นนี้ทำ **Step 4 ของ Integration Roadmap** โดยให้ Strain, Recovery และ Readiness เรียนรู้จากข้อมูลจริงของผู้ใช้ แทนการใช้ threshold คงที่เพียงอย่างเดียว:

- เพิ่ม Calibration Check แบบสั้นวันละ 1 ครั้ง: readiness ที่รู้สึกจริง, perceived Strain และผลการซ้อม
- ช่วง 1–6 วันเป็น **Bootstrap**, 7–20 วันเป็น **Learning**, และตั้งแต่ 21 วันเป็น **Personalized**
- ปรับ Readiness offset ได้สูงสุด ±10 คะแนน และ Strain offset ได้สูงสุด ±2.5/21
- ปรับน้ำหนักปัจจัย Recovery ได้ในกรอบจำกัด ±15% และต้องมี Feedback อย่างน้อย 7 วัน
- ใช้ rolling median และ robust variability ของ Resting HR/HRV เพื่อลดผลกระทบจาก outlier
- Feedback ของวันปัจจุบันเริ่มมีผลกับวันถัดไป เพื่อไม่ให้โมเดลปรับคะแนนย้อนหลังเข้าหาคำตอบของตัวเอง
- Pain, illness, altered gait, swelling และ dizziness safety gates ยังคงมีสิทธิ์เหนือ Calibration เสมอ
- เก็บ Feedback ใน `metadata` เดิม ไม่เปลี่ยน IndexedDB schema และไม่กระทบ Backup/ข้อมูลเดิม
- เพิ่มหน้าแสดง Calibration phase, confidence, offsets, factor weights และ Feedback history ใน **Strain & Recovery**

รายละเอียด: `docs/SCORE_CALIBRATION.md`

## Version 1.7.0 — Auto Sync Status & Retry Queue

รุ่นนี้ทำ **Step 3 ของ Integration Roadmap** โดยเพิ่มวงจร Sync ที่ใช้งานจริงต่อจาก Strava Wizard และ Cross-provider Deduplication:

- แสดงสถานะ Sync แยกตาม Apple Health, Garmin, Suunto และ Strava
- แสดงเวลาลอง Sync ล่าสุด, เวลาสำเร็จล่าสุด, ผลนำเข้า และข้อผิดพลาดล่าสุด
- Auto Sync เมื่อเปิดแอป, กลับมาออนไลน์, กลับมาเปิดแท็บ หรือกลับมาโฟกัสหน้าต่าง
- ตั้งช่วง Auto Sync ได้ 15 / 30 / 60 / 120 นาที
- Retry Queue แบบ persistent พร้อม backoff 1 นาที, 5 นาที, 15 นาที, 1 ชั่วโมง และ 6 ชั่วโมง
- รองรับ `Retry-After` จาก provider/Worker และหยุดอัตโนมัติหลังล้มเหลว 5 ครั้ง
- ไม่ Retry ข้อผิดพลาดที่แก้ด้วยการรอไม่ได้ เช่น ยังไม่เชื่อมต่อ, authorization error หรือ provider adapter ที่ยังไม่ได้รับสิทธิ์
- ปุ่ม Sync all, Retry now และ Clear queue ในหน้า **บันทึก → เชื่อมต่อ**
- ทุกการ Retry ผ่าน Cross-provider Deduplication จึงไม่เพิ่ม Strain ซ้ำ
- เก็บสถานะไว้ใน `metadata` โดยไม่เปลี่ยน IndexedDB schema; ข้อมูลและ Backup เดิมยังใช้ต่อได้

ข้อจำกัด: browser ไม่สามารถทำงานต่อเนื่องเมื่อ PWA ถูกปิดหรือระบบพักแอป คิวจะกลับมาทำงานเมื่อเปิดแอป/ออนไลน์/มองเห็นอีกครั้ง

รายละเอียด: `docs/SYNC_LIFECYCLE.md`

## Version 1.6.0 — Cross-provider Activity Deduplication

รุ่นนี้ทำ **Step 2 ของ Integration Roadmap** ต่อจาก Strava Setup Wizard โดยป้องกัน Workout เดียวถูกนับ Strain ซ้ำเมื่อข้อมูลมาจาก Apple Health, Strava, Garmin, Suunto หรือไฟล์ GPX/TCX หลายทาง

- เทียบ `externalId` ของ Provider ก่อนเพื่ออัปเดตรายการเดิมอย่างแม่นยำ
- เทียบเวลาเริ่ม ระยะเวลา ระยะทาง ประเภทกิจกรรม และ Average HR สำหรับข้อมูลข้าม Provider
- รวมข้อมูลที่มั่นใจสูงเป็น Canonical Activity เดียว พร้อมเก็บ `sources[]` และ `externalRefs[]` เพื่อ trace กลับได้
- เลือกค่าที่เหมาะที่สุดแยกตาม field เช่น Elevation จาก GPX/Garmin/Suunto และ Active Energy จาก Apple Health
- กรณีไม่ชัดเจนจะไม่รวมอัตโนมัติ แต่ส่งเข้า Review Queue ให้ผู้ใช้เลือก **รวม** หรือ **แยกไว้**
- ตรวจข้อมูลเก่าหนึ่งครั้งเมื่อเปิดแอป และตรวจซ้ำทุกครั้งที่ Apple Health, Strava หรือไฟล์กิจกรรมถูกนำเข้า
- หน้า **บันทึก → ข้อมูล & Wearables → Activity Integrity** แสดงจำนวนกิจกรรมที่รวมแล้วและรายการรอตรวจ
- ไม่เปลี่ยน IndexedDB schema; ข้อมูลเดิมและ Backup เดิมยังใช้ต่อได้

รายละเอียด: `docs/ACTIVITY_DEDUP.md`

## Version 1.5.0 — Strava Setup Wizard

รุ่นนี้ทำ **Step 1 ของ Integration Roadmap** โดยรักษาฟีเจอร์เดิมทั้งหมด และลดการตั้งค่า Strava จากหลายคำสั่งให้เหลือ workflow แบบมีตัวช่วย:

- เพิ่ม Strava Setup Wizard ใน **บันทึก → เชื่อมต่อ**
- คาดการณ์ Callback Domain จาก Cloudflare workers.dev URL เมื่อทำได้
- เพิ่มคำสั่งเดียว `npm run setup:strava`
- Script สร้าง KV 3 ชุด, ตั้ง required secrets, Deploy Worker และสร้างไฟล์ผลลัพธ์อัตโนมัติ
- Client Secret ไม่ถูกบันทึกลง Repo หรือไฟล์ผลลัพธ์
- เพิ่ม Import `strava-setup-result.json` เพื่อบันทึก Worker URL โดยไม่ต้องพิมพ์เอง
- เพิ่มระบบตรวจ App Origin, KV, Strava Secrets และ Worker readiness จากในแอป
- เพิ่มปุ่ม Copy Callback Domain/URL และ Connect/Sync ในขั้นตอนเดียวกัน
- รองรับภาษาไทยและอังกฤษครบใน Wizard
- ไม่เปลี่ยน IndexedDB schema และไม่ตัดเมนูหรือ workflow เดิม

รายละเอียด: `docs/STRAVA_SETUP_WIZARD.md`

## Version 1.4.0 — Thai / English Bilingual UI

รุ่นนี้รักษาฟีเจอร์ v1.3.0 ทั้งหมด และเพิ่มระบบสองภาษาแบบใช้งานจริง:

- ปุ่ม `EN / ไทย` ใน Header สลับภาษาได้ทันที
- เลือกภาษาได้อีกทางจาก **บันทึก > ตั้งค่า**
- จดจำภาษาที่เลือกใน IndexedDB และใช้ต่อในการเปิดครั้งถัดไป
- แปลเมนูหลัก หน้า Dashboard, Plan, Train, Food, Log, Strain/Recovery, Rehab, Nutrition, Gear, Data, Connections, Race Profiles และ Settings
- แปล Form, Modal, Toast, Safety warning, Rehab cues, Nutrition guidance และ Wearable setup
- วันและรูปแบบตัวเลขเปลี่ยนตามภาษา
- ฐานอาหารใช้ `nameTh / nameEn`; ภาษาอังกฤษเลือกชื่ออังกฤษเมื่อมี และ fallback เป็นชื่อไทยอย่างปลอดภัย
- เมนูส่วนตัวรองรับกรอกชื่อไทยและอังกฤษแยกกัน
- ข้อความส่วนตัว เช่น Motivation, Notes และ Pain note ยังคงตามภาษาที่ผู้ใช้กรอก ไม่ถูกแปลงข้อมูลต้นฉบับ
- การเปลี่ยนภาษาไม่สร้างฐานข้อมูลใหม่และไม่กระทบประวัติเดิม

รายละเอียดสำหรับการพัฒนาต่ออยู่ที่ `docs/I18N.md`

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


## Apple Health insights in v2.4.0

After the iPhone Shortcut sends data and the app pulls the latest payload, the **Today** screen now shows the imported Apple Health metrics and explains exactly where they are used:

- Steps, Active Energy and Exercise Minutes contribute to daily behavior load and Strain.
- Sleep, Resting HR and HRV contribute to Recovery, rolling baselines and Readiness confidence.
- Apple Active Energy is combined with BMR for the daily calorie/fuel target without adding a sedentary activity factor again.
- Weight and Body Fat continue into Body Composition trends.

Strava remains the workout source of truth, so the Shortcut should not send workout records while Strava is connected.

## Apple Health through iPhone Shortcuts

Version 2.3.0 adds a separate Apple Health Shortcuts Bridge for users who do not build the native iOS Companion. Start with:

```bash
npm run setup:apple-health-shortcut
```

Then open **More → Devices & Connections → Apple Health** and import the generated `.local.json` setup result. See `docs/APPLE_HEALTH_SHORTCUTS_BRIDGE.md` for the iPhone Shortcut steps.

import { selectRaceCountdown, selectScoreHistory, selectToday, selectWeekSummary } from '../core/selectors.js';
import { selectAppleHealthInsights } from '../core/health-insights.js';
import { buildUnifiedInsights } from '../core/unified-insights.js';
import { buildPersonalTrends } from '../core/personal-trends.js';
import { buildTrailCoachIntelligence } from '../core/trail-coach.js';
import { energyBalanceForDate, nutritionTarget } from '../core/nutrition.js';
import { escapeHtml, formatNumber, pageHeader } from './components.js';

export function renderCoach(container, state, app) {
  const today = selectToday(state);
  const countdown = selectRaceCountdown(state);
  const week = selectWeekSummary(state, today.plan.weekSessions);
  const health = selectAppleHealthInsights(state, today.dateKey, 90);
  const scoreHistory = selectScoreHistory(state, 7, today.dateKey);
  const nutritionBalance = energyBalanceForDate(state, today.dateKey);
  const nutritionPlan = nutritionTarget(state, today.dateKey);
  const unified = buildUnifiedInsights({ today, health, scoreHistory, nutritionBalance, nutritionTarget: nutritionPlan });
  const personal = buildPersonalTrends({ healthRows: health.rows, activities: state.activities, endDateKey: today.dateKey, rangeDays: 90, sleepTargetHours: 7.5 });
  const coach = buildTrailCoachIntelligence({ state, today, unified, personalTrends: personal, week, countdown, endDateKey: today.dateKey });
  const en = app.language === 'en';
  const prescription = prescriptionCopy(coach.prescription, en);

  container.innerHTML = `
    ${pageHeader(en ? 'Trail Coach' : 'Trail Coach', en ? 'One clear prescription, with the evidence and limits behind it.' : 'คำแนะนำเดียวที่ชัดเจน พร้อมเหตุผลและข้อจำกัดของข้อมูล', en ? 'Train smart · Recover fully · Arrive ready' : 'Train smart · Recover fully · Arrive ready')}

    <section class="card trail-coach-hero tone-${escapeHtml(coach.prescription.hardStop ? 'risk' : scoreTone(unified.readiness.score))}">
      <div class="trail-coach-hero-head">
        <div><div class="eyebrow"><section class="card flat" style="margin-bottom:14px">
  <div class="section-head">
    <div>
      <div class="card-title">${en ? 'Controlled AI layer' : 'AI แบบมี Guardrails'}</div>
      <strong>${en ? 'Local Coach decides. AI explains.' : 'Local Coach ตัดสิน ส่วน AI ช่วยอธิบาย'}</strong>
    </div>
    <a class="button secondary" href="#/ai-coach">
      ${en ? 'Open AI Coach' : 'เปิด AI Coach'}
    </a>
  </div>
</section>
${en ? 'TODAY’S PRESCRIPTION' : 'คำแนะนำการฝึกวันนี้'}</div><h2>${escapeHtml(prescription.title)}</h2><p>${escapeHtml(prescription.detail)}</p></div>
        <div class="trail-coach-confidence"><strong>${coach.prescription.confidence}%</strong><span>${en ? 'confidence' : 'ความมั่นใจ'}</span></div>
      </div>
      <div class="trail-prescription-grid">
        ${prescriptionMetric(en ? 'Session' : 'รูปแบบ', prescription.session, null, en)}
        ${prescriptionMetric(en ? 'Distance' : 'ระยะ', coach.prescription.suggestedDistanceKm == null ? '—' : `${formatNumber(coach.prescription.suggestedDistanceKm,1)} km`, coach.prescription.distanceFactor, en)}
        ${prescriptionMetric(en ? 'Vertical' : 'Vertical', coach.prescription.suggestedVerticalM == null ? '—' : `${formatNumber(coach.prescription.suggestedVerticalM)} m`, coach.prescription.verticalFactor, en)}
        ${prescriptionMetric(en ? 'Intensity' : 'ความหนัก', intensityLabel(coach.prescription.intensityCode, en), null, en)}
      </div>
      <div class="trail-reason-list">${coach.prescription.reasons.map(item => reasonRow(item, en)).join('')}</div>
      ${coach.prescription.missing.length ? `<div class="trail-data-warning"><strong>${en ? 'Recommendation limits' : 'ข้อจำกัดของคำแนะนำ'}</strong><span>${escapeHtml(missingLabel(coach.prescription.missing, en))}</span></div>` : ''}
      <div class="button-row"><a class="button primary" href="#/checkin">${today.checkin ? (en ? 'Edit check-in' : 'แก้ไข Check-in') : (en ? 'Complete check-in' : 'ทำ Check-in')}</a><a class="button secondary" href="#/plan">${en ? 'Open training plan' : 'เปิดแผนซ้อม'}</a></div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Trail readiness' : 'ความพร้อมสำหรับ Trail'}</h2><small>${en ? 'Separate decisions for the race, long run and climbing load' : 'แยกการตัดสินใจเรื่องสนาม Long Run และโหลดทางชัน'}</small></div><span>${en ? 'Overall confidence' : 'ความมั่นใจรวม'} ${coach.confidence}%</span></div>
      <div class="trail-readiness-grid">
        ${readinessCard({ title: en ? 'Race readiness' : 'ความพร้อมสนาม', score: coach.race.score, status: raceStatus(coach.race.status,en), detail: raceDetail(coach.race,en), tone: scoreTone(coach.race.score) })}
        ${readinessCard({ title: en ? 'Long-run readiness' : 'ความพร้อม Long Run', score: coach.longRun.score, status: longRunStatus(coach.longRun.status,en), detail: longRunDetail(coach.longRun,en), tone: scoreTone(coach.longRun.score) })}
        ${readinessCard({ title: en ? 'Elevation load' : 'โหลดทางชัน 7 วัน', score: elevationDisplayScore(coach.elevationLoad), status: elevationStatus(coach.elevationLoad.status,en), detail: elevationDetail(coach.elevationLoad,en), tone: elevationTone(coach.elevationLoad.status) })}
      </div>
    </section>

    <section class="section grid two trail-coach-detail-grid">
      <article class="card trail-race-components">
        <div class="section-head compact"><div><h2>${en ? 'Race-readiness contributors' : 'องค์ประกอบความพร้อมสนาม'}</h2><small>${en ? 'Descriptive training indicators—not a finish guarantee' : 'เป็นตัวชี้วัดการเตรียมตัว ไม่ใช่การรับประกันผลการแข่งขัน'}</small></div><span>${coach.race.countdownDays == null ? '—' : `${coach.race.countdownDays} ${en ? 'days' : 'วัน'}`}</span></div>
        ${Object.entries(coach.race.components || {}).map(([key,value]) => componentBar(componentLabel(key,en), value)).join('') || `<div class="empty">${en ? 'Choose a race to calculate readiness.' : 'เลือกสนามเพื่อคำนวณความพร้อม'}</div>`}
        ${coach.race.gaps?.length ? `<div class="trail-gap-list"><strong>${en ? 'Current priorities' : 'สิ่งที่ควรให้ความสำคัญ'}</strong>${coach.race.gaps.map(gap => `<span>${escapeHtml(gapLabel(gap,en))}</span>`).join('')}</div>` : ''}
      </article>

      <article class="card trail-longrun-components">
        <div class="section-head compact"><div><h2>${en ? 'Long-run evidence' : 'หลักฐาน Long Run'}</h2><small>${en ? 'Uses the last 28 days of recorded run and hike sessions' : 'ใช้กิจกรรมวิ่งและ Hike ที่บันทึกใน 28 วันล่าสุด'}</small></div><span>${coach.longRun.confidence}%</span></div>
        <div class="trail-evidence-grid">
          ${evidenceMetric(en ? 'Longest duration' : 'เวลานานที่สุด', formatDuration(coach.longRun.longestDurationMin,en))}
          ${evidenceMetric(en ? 'Longest distance' : 'ระยะไกลที่สุด', `${formatNumber(coach.longRun.longestDistanceKm,1)} km`)}
          ${evidenceMetric(en ? 'Vertical in longest block' : 'Vertical สูงสุด', `${formatNumber(coach.longRun.longestElevationGainM)} m`)}
          ${evidenceMetric(en ? 'Long sessions' : 'จำนวน Long Session', `${coach.longRun.longSessionCount}`)}
        </div>
        <div class="trail-component-grid">${Object.entries(coach.longRun.components).map(([key,value]) => componentBar(componentLabel(key,en),value)).join('')}</div>
      </article>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Six-week progression' : 'แนวโน้ม 6 สัปดาห์'}</h2><small>${en ? 'Distance, vertical gain and training load are shown together' : 'ดูระยะ Vertical gain และ Training Load ในบริบทเดียวกัน'}</small></div><span>${progressionStatus(coach.progression.status,en)}</span></div>
      <article class="card trail-progression-card">
        ${progressionChart(coach.progression.buckets,en)}
        <div class="trail-progression-summary">
          ${changeMetric(en ? 'Distance vs last week' : 'ระยะเทียบสัปดาห์ก่อน', coach.progression.distanceChangePct, 'km')}
          ${changeMetric(en ? 'Vertical vs last week' : 'Vertical เทียบสัปดาห์ก่อน', coach.progression.verticalChangePct, 'm')}
          ${changeMetric(en ? 'Load vs last week' : 'Load เทียบสัปดาห์ก่อน', coach.progression.loadChangePct, '')}
        </div>
      </article>
    </section>

    <section class="section">
      <article class="card flat trail-method-card">
        <div class="section-head compact"><h2>${en ? 'How to use this recommendation' : 'วิธีใช้คำแนะนำนี้'}</h2><span>${en ? 'Training guidance' : 'คำแนะนำด้านการฝึก'}</span></div>
        <p>${en ? 'Pain or illness safety gates always override performance scores. Missing or stale recovery data lowers confidence; the app does not fill in missing HRV, sleep or heart-rate values.' : 'Pain หรืออาการป่วยมีอำนาจเหนือคะแนนด้าน Performance เสมอ ข้อมูล Recovery ที่ขาดหรือเก่าจะลดระดับความมั่นใจ และระบบจะไม่สร้างค่า HRV การนอน หรือ Heart Rate ที่ไม่มีอยู่จริง'}</p>
        <small>${en ? 'This is not medical diagnosis, injury prediction or a race-finish guarantee.' : 'ไม่ใช่การวินิจฉัยทางการแพทย์ การทำนายการบาดเจ็บ หรือการรับประกันว่าจะจบการแข่งขัน'}</small>
      </article>
    </section>`;
}

function prescriptionMetric(label, value, factor = null, en = false) {
  const factorText = factor != null && factor !== 1 ? `<small>${Math.round(factor * 100)}% ${en ? 'of plan' : 'ของแผน'}</small>` : '';
  return `<div class="trail-prescription-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${factorText}</div>`;
}
function readinessCard({ title, score, status, detail, tone }) { return `<article class="card flat trail-readiness-card tone-${escapeHtml(tone)}"><span>${escapeHtml(title)}</span><div><strong>${score == null ? '—' : formatNumber(score)}</strong>${score == null ? '' : '<small>/100</small>'}</div><h3>${escapeHtml(status)}</h3><p>${escapeHtml(detail)}</p></article>`; }
function componentBar(label,value) { const safe = Math.max(0,Math.min(100,Number(value)||0)); return `<div class="trail-component-row"><div><span>${escapeHtml(label)}</span><strong>${formatNumber(safe)}</strong></div><div class="progress"><span style="width:${safe}%"></span></div></div>`; }
function evidenceMetric(label,value) { return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`; }
function changeMetric(label,value) { return `<div><span>${escapeHtml(label)}</span><strong>${value == null ? '—' : `${value > 0 ? '+' : ''}${formatNumber(value)}%`}</strong></div>`; }
function reasonRow(item,en) { return `<div class="trail-reason-row ${escapeHtml(item.tone || 'neutral')}"><span>${item.tone==='risk'?'!':item.tone==='watch'?'↗':item.tone==='good'?'✓':'•'}</span><div><strong>${escapeHtml(reasonLabel(item.code,en))}</strong>${item.value != null ? `<small>${escapeHtml(reasonValue(item,en))}</small>` : ''}</div></div>`; }

function progressionChart(buckets,en) {
  if (!buckets?.length) return `<div class="empty">${en ? 'No progression data yet.' : 'ยังไม่มีข้อมูลแนวโน้ม'}</div>`;
  const maxDistance = Math.max(1,...buckets.map(item=>Number(item.distanceKm)||0));
  const maxVertical = Math.max(1,...buckets.map(item=>Number(item.elevationGainM)||0));
  const maxLoad = Math.max(1,...buckets.map(item=>Number(item.totalLoad)||0));
  return `<div class="trail-week-chart">${buckets.map((item,index)=>`<div class="trail-week-column"><div class="trail-week-bars"><i class="distance" style="--h:${Math.max(3,(item.distanceKm/maxDistance)*100)}%" title="${item.distanceKm} km"></i><i class="vertical" style="--h:${Math.max(3,(item.elevationGainM/maxVertical)*100)}%" title="+${item.elevationGainM} m"></i><i class="load" style="--h:${Math.max(3,(item.totalLoad/maxLoad)*100)}%" title="Load ${item.totalLoad}"></i></div><span>${en ? `W${index+1}` : `สัปดาห์ ${index+1}`}</span><small>${formatNumber(item.distanceKm,1)} km · +${formatNumber(item.elevationGainM)} m</small></div>`).join('')}</div><div class="trail-chart-legend"><span class="distance">${en?'Distance':'ระยะ'}</span><span class="vertical">Vertical</span><span class="load">Load</span></div>`;
}

function prescriptionCopy(item,en){const map={follow_plan:[en?'Follow the planned session':'ทำตามแผนได้',en?'Keep the planned volume and avoid adding unplanned intensity.':'รักษาปริมาณตามแผนและไม่เพิ่มความหนักนอกแผน'],reduce_15:[en?'Reduce today’s load by about 15%':'ลดโหลดวันนี้ประมาณ 15%',en?'Keep the session controlled and reduce climbing if fatigue rises.':'คุมความหนักและลดทางชันหากความล้าเพิ่มขึ้น'],reduce_25:[en?'Reduce today’s load by about 25%':'ลดโหลดวันนี้ประมาณ 25%',en?'Use easy aerobic effort and shorten distance or vertical gain.':'ใช้ Easy aerobic และลดระยะหรือ Vertical gain'],replace_with_easy:[en?'Replace the hard session with easy work':'เปลี่ยน Session หนักเป็น Easy',en?'Choose easy aerobic running, walking or gentle mobility.':'เลือก Easy aerobic เดิน หรือ Mobility เบา ๆ'],replace_easy_or_rest:[en?'Use recovery work or rest':'ทำ Recovery เบามากหรือพัก',en?'Current recovery does not support a demanding session.':'Recovery ปัจจุบันไม่สนับสนุนการฝึกที่หนัก'],rest_assess:[en?'Rest and assess symptoms':'พักและประเมินอาการ',en?'Pain or symptom safety signals override the training plan.':'Pain หรือสัญญาณอาการมีอำนาจเหนือแผนซ้อม'],check_in_first:[en?'Check in before hard training':'ทำ Check-in ก่อน Session หนัก',en?'Keep effort easy until pain, fatigue and soreness are confirmed.':'คุมความหนักไว้ระดับ Easy จนกว่าจะประเมิน Pain ความล้า และอาการล้ากล้ามเนื้อ'],cap_long_run:[en?'Shorten the long run':'ลด Long Run',en?'Endurance history is not yet strong enough for the full planned dose.':'ประวัติ Endurance ยังไม่รองรับปริมาณเต็มตามแผน'],taper_quality:[en?'Keep quality short during taper':'รักษา Quality ให้สั้นในช่วง Taper',en?'Preserve intensity without adding volume or vertical work.':'รักษาความคมโดยไม่เพิ่ม Volume หรือ Vertical']};const [title,detail]=map[item.actionCode]||map.follow_plan;return{title,detail,session:sessionLabel(item.suggestedType,en)};}
function intensityLabel(code,en){const map={planned_quality:en?'Planned quality':'Quality ตามแผน',easy_controlled:en?'Easy / controlled':'Easy / คุมความหนัก',rest_only:en?'Rest only':'พัก',easy_until_checkin:en?'Easy until check-in':'Easy จนกว่า Check-in',recovery_only:en?'Very light recovery':'Recovery เบามาก',easy_aerobic:en?'Easy aerobic':'Easy aerobic',controlled_quality:en?'Controlled quality':'Quality แบบคุม',easy_endurance:en?'Easy endurance':'Easy endurance',short_quality_no_extra:en?'Short quality, no extras':'Quality สั้น ไม่เพิ่มงาน'};return map[code]||code;}
function sessionLabel(value,en){const map={'Rest / assessment':en?'Rest / assessment':'พัก / ประเมินอาการ','Rest / easy recovery':en?'Rest / easy recovery':'พัก / Recovery เบา','Easy aerobic / walk':en?'Easy aerobic / walk':'Easy aerobic / เดิน','Easy until check-in':en?'Easy until check-in':'Easy จนกว่า Check-in','Shortened long easy':en?'Shortened long easy':'Long Easy แบบลดปริมาณ'};return map[value]||value;}
function reasonLabel(code,en){const map={pain_hard_stop:en?'Pain safety gate is active':'Pain Safety Gate ทำงาน',subjective_data_missing:en?'Subjective check-in is missing':'ยังไม่มี Subjective Check-in',recovery_low:en?'Recovery is low':'Recovery ต่ำ',pain_caution:en?'Pain requires caution':'ต้องเฝ้าระวัง Pain',load_risk:en?'Recent load is outside your range':'โหลดล่าสุดนอกช่วงปกติ',readiness_moderate:en?'Readiness is limited':'Readiness ยังจำกัด',recovery_not_full:en?'Recovery is not fully restored':'Recovery ยังไม่เต็ม',energy_low:en?'Energy availability looks low':'พลังงานที่พร้อมใช้ค่อนข้างต่ำ',vertical_spike:en?'Vertical load rose quickly':'Vertical load เพิ่มเร็ว',signals_support_plan:en?'Current signals support the plan':'สัญญาณปัจจุบันสนับสนุนแผน',long_run_readiness_limited:en?'Long-run readiness is limited':'ความพร้อม Long Run ยังจำกัด',taper_window:en?'You are in the taper window':'อยู่ในช่วง Taper'};return map[code]||code;}
function reasonValue(item,en){if(item.code==='taper_window')return `${item.value} ${en?'days to race':'วันถึงสนาม'}`;if(item.code.includes('load')||item.code.includes('vertical'))return `${item.value>0?'+':''}${formatNumber(item.value)}%`;if(item.value!=null)return `${formatNumber(item.value)}/100`;return '';}
function missingLabel(items,en){const map={subjective_checkin:en?'subjective check-in':'Subjective Check-in',readiness:'Readiness',recovery:'Recovery',fresh_recovery_metrics:en?'fresh sleep/RHR/HRV':'Sleep/RHR/HRV ที่เป็นข้อมูลล่าสุด'};return items.map(item=>map[item]||item).join(' · ');}
function raceStatus(status,en){const map={no_race:en?'No race selected':'ยังไม่ได้เลือกสนาม',insufficient:en?'Building evidence':'กำลังสร้างหลักฐาน',building:en?'Building toward the race':'กำลังสร้างความพร้อม',on_track:en?'On track for this phase':'อยู่ในแนวทางของ Phase นี้',watch:en?'Key gaps need attention':'มี Gap ที่ควรแก้'};return map[status]||status;}
function raceDetail(race,en){if(race.score==null)return en?'Add a target race to calculate specificity.':'เพิ่มสนามเป้าหมายเพื่อคำนวณความเฉพาะเจาะจง';return `${race.countdownDays} ${en?'days to race':'วันถึงสนาม'} · ${stageLabel(race.stage,en)} · ${en?'confidence':'ความมั่นใจ'} ${race.confidence}%`;}
function stageLabel(stage,en){const map={foundation:en?'Foundation':'Foundation',build:en?'Build':'Build',specific:en?'Race specific':'Race specific',taper:'Taper',unknown:en?'Unknown phase':'ยังไม่ทราบ Phase'};return map[stage]||stage;}
function longRunStatus(status,en){const map={ready:en?'Ready for the planned long run':'พร้อมสำหรับ Long Run ตามแผน',moderate:en?'Reasonable with control':'ทำได้โดยต้องคุม',limited:en?'Shorten or simplify':'ควรลดหรือทำให้ง่ายขึ้น',not_ready:en?'Not ready for a full long run':'ยังไม่พร้อมสำหรับ Long Run เต็ม',stop:en?'Do not proceed':'ไม่ควรดำเนินการ'};return map[status]||status;}
function longRunDetail(item,en){return `${en?'Longest':'นานที่สุด'} ${formatDuration(item.longestDurationMin,en)} · ${item.longSessionCount} ${en?'long sessions in 28 days':'Long Session ใน 28 วัน'} · ${en?'confidence':'ความมั่นใจ'} ${item.confidence}%`;}
function elevationStatus(status,en){const map={no_data:en?'No recent trail load':'ยังไม่มีโหลด Trail ล่าสุด',spike:en?'Vertical load spiked':'Vertical load เพิ่มเร็ว',watch:en?'Vertical load is rising':'Vertical load กำลังเพิ่ม',mountain_specific:en?'Mountain-specific week':'สัปดาห์ที่มีความเฉพาะทางภูเขา',general:en?'General trail load':'โหลด Trail ทั่วไป'};return map[status]||status;}
function elevationDetail(item,en){return `${formatNumber(item.distanceKm,1)} km · +${formatNumber(item.elevationGainM)} m · ${formatNumber(item.climbDensityMPerKm)} ${en?'m climb/km':'m ไต่/กม.'}`;}
function elevationDisplayScore(item){if(!item.sessions)return null;return Math.round(Math.max(0,Math.min(100,45+Math.min(35,item.climbDensityMPerKm/4)+(item.activeDays*5)-(item.status==='spike'?25:0))));}
function elevationTone(status){return status==='spike'?'risk':status==='watch'?'watch':status==='no_data'?'neutral':'good';}
function progressionStatus(status,en){const map={building_history:en?'Building history':'กำลังสร้างประวัติ',spike:en?'Rapid weekly increase':'เพิ่มเร็วจากสัปดาห์ก่อน',watch:en?'Progressing—watch the ramp':'กำลังเพิ่ม ควรติดตาม',stable:en?'Progression is controlled':'การเพิ่มโหลดอยู่ในระดับควบคุม'};return map[status]||status;}
function gapLabel(gap,en){const map={weekly_volume:en?'Build sustainable weekly volume':'สร้าง Weekly volume อย่างยั่งยืน',vertical_specificity:en?'Increase climbing specificity gradually':'เพิ่มความเฉพาะเจาะจงทางชันทีละน้อย',long_run_endurance:en?'Strengthen long-run endurance':'เสริม Endurance จาก Long Run',plan_consistency:en?'Improve plan consistency':'เพิ่มความสม่ำเสมอตามแผน',recovery:en?'Restore recovery before adding load':'ฟื้น Recovery ก่อนเพิ่มโหลด',load_spike:en?'Stabilize the recent load spike':'ทำให้ Load spike กลับมาสมดุล'};return map[gap]||gap;}
function componentLabel(key,en){const map={weeklyVolume:en?'Weekly volume':'Weekly volume',verticalSpecificity:en?'Vertical specificity':'ความเฉพาะเจาะจงทางชัน',longRunEndurance:en?'Long-run endurance':'Long-run endurance',consistency:en?'Plan consistency':'ความสม่ำเสมอตามแผน',recovery:'Recovery',loadBalance:en?'Load balance':'สมดุลโหลด',terrainSpecificity:en?'Terrain specificity':'ความเฉพาะเจาะจงของ Terrain',endurance:'Endurance',form:'Form'};return map[key]||key;}
function scoreTone(score){return score==null?'neutral':score>=75?'good':score>=50?'watch':'risk';}
function formatDuration(minutes,en){const total=Math.max(0,Number(minutes)||0);const h=Math.floor(total/60);const m=total%60;return h?`${h}${en?'h':'ชม.'} ${m?`${m}${en?'m':'น.'}`:''}`.trim():`${m}${en?'m':'น.'}`;}

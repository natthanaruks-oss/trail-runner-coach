const HARD_TYPES = new Set(['Hill', 'Tempo', 'Long', 'B2B', 'Night', 'Race']);
const DESCENT_TYPES = new Set(['Hill', 'Long', 'B2B', 'Night']);

export function recommendSession(readiness, plannedSession) {
  const type = plannedSession?.t || plannedSession?.type || 'Rest';
  const base = {
    originalType: type,
    title: plannedSession?.title?.th || plannedSession?.title || type,
    distanceFactor: 1,
    verticalFactor: 1,
    intensity: 'ตามแผน',
    action: 'follow_plan',
    reasons: []
  };

  if (!readiness) {
    return { ...base, action: 'check_readiness', intensity: 'เช็ก Readiness ก่อน', reasons: ['ยังไม่มีข้อมูลวันนี้'] };
  }

  if (readiness.status === 'red') {
    return {
      ...base,
      action: 'rest_or_rehab',
      suggestedType: 'Rest / Rehab',
      distanceFactor: 0,
      verticalFactor: 0,
      intensity: 'พักหรือ active recovery เบามาก',
      reasons: explainFlags(readiness.flags, 'red')
    };
  }

  if (readiness.status === 'yellow') {
    const isHard = HARD_TYPES.has(type);
    return {
      ...base,
      action: isHard ? 'replace_with_easy' : 'reduce_load',
      suggestedType: isHard ? 'Easy / Walk / Rehab' : type,
      distanceFactor: isHard ? 0.55 : 0.75,
      verticalFactor: DESCENT_TYPES.has(type) ? 0.4 : 0.7,
      intensity: 'ลด RPE และหยุดก่อนอาการแย่ลง',
      reasons: explainFlags(readiness.flags, 'yellow')
    };
  }

  if (readiness.loadTrend.warning.level === 'high' && HARD_TYPES.has(type)) {
    return {
      ...base,
      action: 'cap_load',
      distanceFactor: 0.8,
      verticalFactor: 0.75,
      intensity: 'ทำได้แต่ไม่ไล่ pace และไม่เพิ่มงานนอกแผน',
      reasons: ['โหลด 7 วันเพิ่มเร็วเมื่อเทียบกับประวัติ 28 วัน']
    };
  }

  return { ...base, reasons: ['Recovery และ pain signal อยู่ในระดับที่รับได้'] };
}

function explainFlags(flags = [], status) {
  const map = {
    short_sleep: 'นอนน้อย',
    poor_sleep_quality: 'คุณภาพการนอนต่ำ',
    elevated_resting_hr: 'Resting HR สูงกว่า baseline',
    suppressed_hrv: 'HRV ต่ำกว่า baseline',
    high_fatigue: 'ความล้าสูง',
    high_stress: 'ความเครียดสูง',
    high_muscleSoreness: 'กล้ามเนื้อล้าสูง',
    pain_6_plus: 'อาการเจ็บระดับ 6/10 ขึ้นไป',
    pain_with_walking: 'เจ็บแม้ขณะเดิน',
    altered_gait: 'รูปแบบการเดินเปลี่ยน',
    swelling: 'มีอาการบวม',
    recurring_pain: 'จุดเดิมเจ็บซ้ำ',
    illness_symptoms: 'มีอาการคล้ายป่วย',
    unusual_dizziness: 'มีอาการเวียนศีรษะผิดปกติ',
    rapid_load_increase: 'โหลดเพิ่มเร็ว'
  };
  const reasons = [...new Set(flags.map(flag => map[flag]).filter(Boolean))];
  return reasons.length ? reasons : [status === 'red' ? 'สัญญาณฟื้นตัวไม่เหมาะกับการซ้อมหนัก' : 'ควรลดโหลดเพื่อป้องกันการสะสมความล้า'];
}

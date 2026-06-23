export function localDateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export function parseLocalDate(dateKey) {
  return new Date(`${dateKey}T00:00:00`);
}

export function addDays(dateKey, days) {
  const d = parseLocalDate(dateKey);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

export function daysBetween(fromDateKey, toDateKey) {
  const ms = parseLocalDate(toDateKey) - parseLocalDate(fromDateKey);
  return Math.round(ms / 86400000);
}

export function startOfWeek(dateKey = localDateKey(), weekStartsOn = 1) {
  const d = parseLocalDate(dateKey);
  const offset = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - offset);
  return localDateKey(d);
}

export function dateRange(endDateKey, numberOfDays) {
  const out = [];
  for (let i = numberOfDays - 1; i >= 0; i -= 1) out.push(addDays(endDateKey, -i));
  return out;
}

export function formatThaiDate(dateKey, options = {}) {
  const d = parseLocalDate(dateKey);
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    year: options.year === false ? undefined : 'numeric'
  }).format(d);
}

export function dayName(dateKey, short = true) {
  return new Intl.DateTimeFormat('th-TH', { weekday: short ? 'short' : 'long' }).format(parseLocalDate(dateKey));
}

export function nowIso() {
  return new Date().toISOString();
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function pageHeader(title, subtitle = '', eyebrow = '') {
  return `<header class="page-head">${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ''}<h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</header>`;
}

export function statusBadge(status, label) {
  return `<span class="status ${escapeHtml(status || 'neutral')}">${escapeHtml(label)}</span>`;
}

export function metricCard(title, value, unit = '', subtitle = '') {
  return `<article class="card flat"><div class="card-title">${escapeHtml(title)}</div><div class="metric">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div>${subtitle ? `<div class="submetric">${escapeHtml(subtitle)}</div>` : ''}</article>`;
}

export function modalTemplate(title, body) {
  return `<div class="modal-body"><div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="close-modal" data-close-modal aria-label="ปิด">×</button></div>${body}</div>`;
}

export function fieldNumber({ name, label, value = '', min = '', max = '', step = '1', placeholder = '' }) {
  return `<div class="field"><label for="${name}">${escapeHtml(label)}</label><input id="${name}" name="${name}" type="number" inputmode="decimal" value="${escapeHtml(value)}" min="${min}" max="${max}" step="${step}" placeholder="${escapeHtml(placeholder)}"></div>`;
}

export function rangeField({ name, label, value = 3, min = 1, max = 5 }) {
  return `<div class="field full"><label for="${name}">${escapeHtml(label)}</label><div class="range-row"><input id="${name}" name="${name}" type="range" min="${min}" max="${max}" value="${value}"><output class="range-value" data-range-output="${name}">${value}</output></div></div>`;
}

export function emptyState(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

export function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const locale = globalThis.document?.documentElement?.lang === 'en' ? 'en-US' : 'th-TH';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(number);
}

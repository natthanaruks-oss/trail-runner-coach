import { createId } from '../core/id.js';
import { localDateKey } from '../core/date.js';
import { SOURCE_TYPES } from '../core/constants.js';

const textDecoder = new TextDecoder();

export async function parseActivityFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'fit') throw new Error('FIT import adapter is reserved for the next milestone. Export TCX/GPX/CSV from the watch platform for this version.');
  const text = await file.text();
  if (extension === 'gpx') return parseGpx(text, file.name);
  if (extension === 'tcx') return parseTcx(text, file.name);
  if (extension === 'csv') return parseCsvActivities(text, file.name);
  if (extension === 'json') return parseJsonActivities(text, file.name);
  throw new Error(`Unsupported file type: .${extension || 'unknown'}`);
}

export function parseGpx(text, filename = 'activity.gpx') {
  const xml = parseXml(text);
  const points = [...xml.querySelectorAll('trkpt')].map(point => ({
    lat: Number(point.getAttribute('lat')),
    lon: Number(point.getAttribute('lon')),
    ele: numberOrNull(point.querySelector('ele')?.textContent),
    time: point.querySelector('time')?.textContent || null,
    hr: numberOrNull(point.querySelector('hr, *|hr')?.textContent)
  })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (points.length < 2) throw new Error('GPX file does not contain enough track points.');
  return [buildActivity(points, {
    source: SOURCE_TYPES.GPX,
    name: xml.querySelector('trk > name')?.textContent?.trim() || filename.replace(/\.gpx$/i, ''),
    filename
  })];
}

export function parseTcx(text, filename = 'activity.tcx') {
  const xml = parseXml(text);
  const activities = [...xml.querySelectorAll('Activity')];
  if (!activities.length) throw new Error('TCX file does not contain an Activity node.');
  return activities.map((activityNode, activityIndex) => {
    const points = [...activityNode.querySelectorAll('Trackpoint')].map(point => ({
      lat: numberOrNull(point.querySelector('LatitudeDegrees')?.textContent),
      lon: numberOrNull(point.querySelector('LongitudeDegrees')?.textContent),
      ele: numberOrNull(point.querySelector('AltitudeMeters')?.textContent),
      distanceM: numberOrNull(point.querySelector('DistanceMeters')?.textContent),
      time: point.querySelector('Time')?.textContent || null,
      hr: numberOrNull(point.querySelector('HeartRateBpm Value')?.textContent),
      cadence: numberOrNull(point.querySelector('Cadence')?.textContent)
    }));
    const built = buildActivity(points, {
      source: SOURCE_TYPES.TCX,
      name: `TCX Activity ${activityIndex + 1}`,
      filename
    });
    const totalTime = numberOrNull(activityNode.querySelector('TotalTimeSeconds')?.textContent);
    const totalDistance = numberOrNull(activityNode.querySelector('DistanceMeters')?.textContent);
    if (totalTime) built.durationMin = Math.round(totalTime / 60);
    if (totalDistance) built.distanceKm = Number((totalDistance / 1000).toFixed(2));
    return built;
  });
}

export function parseCsvActivities(text, filename = 'activities.csv') {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV has no data rows.');
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).filter(row => row.some(Boolean)).map((row, index) => {
    const item = Object.fromEntries(headers.map((header, column) => [header, row[column]]));
    const date = normalizeDate(item.date || item.startdate || item.activitydate || item.timestamp);
    const distanceKm = numberOrNull(item.distancekm || item.distance || item.km);
    const durationMin = durationToMinutes(item.durationmin || item.duration || item.elapsedtime || item.movingtime);
    return {
      id: createId('activity'),
      externalId: item.id || `${filename}:${index}`,
      date: date || localDateKey(),
      startTime: item.starttime || null,
      name: item.name || item.activityname || item.type || `Imported activity ${index + 1}`,
      type: item.type || item.activitytype || 'Run',
      durationMin: durationMin || 0,
      distanceKm: distanceKm || 0,
      elevationGainM: numberOrNull(item.elevationgainm || item.totalascent || item.elevationgain) || 0,
      elevationLossM: numberOrNull(item.elevationlossm || item.totaldescent || item.elevationloss) || 0,
      avgHr: numberOrNull(item.avghr || item.averageheartrate),
      maxHr: numberOrNull(item.maxhr || item.maximumheartrate),
      rpe: numberOrNull(item.rpe || item.sessionrpe) || null,
      terrain: /trail/i.test(item.type || item.name || '') ? 'trail' : 'road',
      isNight: parseBoolean(item.isnight || item.nightrun),
      source: SOURCE_TYPES.CSV,
      sourceFile: filename,
      importedAt: new Date().toISOString()
    };
  });
}

export function parseJsonActivities(text, filename = 'activities.json') {
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.activities;
  if (!Array.isArray(rows)) throw new Error('JSON must be an array or contain an activities array.');
  return rows.map((row, index) => ({
    ...row,
    id: row.id || createId('activity'),
    externalId: row.externalId || `${filename}:${index}`,
    date: normalizeDate(row.date || row.startTime) || localDateKey(),
    source: row.source || SOURCE_TYPES.MANUAL,
    importedAt: row.importedAt || new Date().toISOString()
  }));
}

function buildActivity(points, meta) {
  let distanceM = 0;
  let gain = 0;
  let loss = 0;
  const hrs = [];
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (Number.isFinite(current.distanceM) && Number.isFinite(previous.distanceM)) {
      distanceM += Math.max(0, current.distanceM - previous.distanceM);
    } else if ([previous.lat, previous.lon, current.lat, current.lon].every(Number.isFinite)) {
      distanceM += haversine(previous.lat, previous.lon, current.lat, current.lon);
    }
    if (Number.isFinite(current.ele) && Number.isFinite(previous.ele)) {
      const delta = current.ele - previous.ele;
      if (delta > 1) gain += delta;
      if (delta < -1) loss += Math.abs(delta);
    }
    if (Number.isFinite(current.hr)) hrs.push(current.hr);
  }
  if (Number.isFinite(points[0].hr)) hrs.push(points[0].hr);
  const firstTime = points.find(point => point.time)?.time;
  const lastTime = [...points].reverse().find(point => point.time)?.time;
  const durationMin = firstTime && lastTime ? Math.max(0, Math.round((new Date(lastTime) - new Date(firstTime)) / 60000)) : 0;
  const startDate = firstTime ? new Date(firstTime) : new Date();
  const startHour = startDate.getHours();
  return {
    id: createId('activity'),
    externalId: `${meta.filename}:${firstTime || points.length}`,
    date: localDateKey(startDate),
    startTime: firstTime || null,
    name: meta.name,
    type: 'Run',
    durationMin,
    distanceKm: Number((distanceM / 1000).toFixed(2)),
    elevationGainM: Math.round(gain),
    elevationLossM: Math.round(loss),
    avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    maxHr: hrs.length ? Math.max(...hrs) : null,
    rpe: null,
    terrain: gain > 150 ? 'trail' : 'road',
    isNight: startHour >= 18 || startHour < 5,
    source: meta.source,
    sourceFile: meta.filename,
    importedAt: new Date().toISOString()
  };
}

function parseXml(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const error = xml.querySelector('parsererror');
  if (error) throw new Error('Invalid XML activity file.');
  return xml;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field.trim()); field = ''; }
    else if (char === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeDate(value) {
  if (!value) return null;
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : localDateKey(parsed);
}

function durationToMinutes(value) {
  if (value == null || value === '') return null;
  if (/^\d+(\.\d+)?$/.test(String(value))) return Number(value);
  const parts = String(value).split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
  return null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value) {
  return ['true', '1', 'yes', 'y'].includes(String(value).toLowerCase());
}

function haversine(lat1, lon1, lat2, lon2) {
  const radius = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

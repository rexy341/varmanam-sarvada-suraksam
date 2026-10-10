/*
  Flood assessment for one place.

  Data comes from Open-Meteo's free APIs (no key, works from the browser):
    Geocoding   place name to coordinates
    Elevation   Copernicus DEM, 90 m grid
    Archive     ERA5 reanalysis daily rain, used for "how often has it rained this hard here"
    Flood       GloFAS river discharge, 1984 onwards plus a 7 day forecast
    Forecast    daily rain forecast

  Free tier is for non-commercial use and needs attribution (shown in the UI).
  All scoring is in assess() below and is plain rules, so every level can be explained.
*/

export const RAIN = { heavy: 64.5, veryHeavy: 115.6, extreme: 204.5 } // IMD classes, mm in 24 h
export const HISTORY_YEARS = 30

const URLS = {
  geocode: 'https://geocoding-api.open-meteo.com/v1/search',
  elevation: 'https://api.open-meteo.com/v1/elevation',
  forecast: 'https://api.open-meteo.com/v1/forecast',
  archive: 'https://archive-api.open-meteo.com/v1/archive',
  flood: 'https://flood-api.open-meteo.com/v1/flood',
}

const cache = new Map() // long history does not change during a session, so fetch it once per place

async function getJson(url, ms = 25000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.reason || `Request failed (${res.status})`)
    return data
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timed out')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const round = (n, d = 1) => (isNum(n) ? Number(n.toFixed(d)) : null)
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length
const median = (sortedAsc) => {
  const m = Math.floor(sortedAsc.length / 2)
  return sortedAsc.length % 2 ? sortedAsc[m] : (sortedAsc[m - 1] + sortedAsc[m]) / 2
}
const key = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (x) => (x * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

/* ---------- place search ---------- */

export async function searchPlaces(name) {
  const q = new URLSearchParams({ name: name.trim(), count: '6', language: 'en', format: 'json' })
  const data = await getJson(`${URLS.geocode}?${q}`)
  return (data.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    lat: r.latitude,
    lng: r.longitude,
  }))
}

/* ---------- elevation ---------- */

export async function fetchElevations(points) {
  const q = `latitude=${points.map((p) => p[0].toFixed(5)).join(',')}&longitude=${points.map((p) => p[1].toFixed(5)).join(',')}`
  const data = await getJson(`${URLS.elevation}?${q}`, 15000)
  return data.elevation || []
}

const BEARINGS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

export function ringPoints(lat, lng, radiiKm = [1, 3]) {
  const pts = []
  for (const km of radiiKm) {
    for (let i = 0; i < 8; i++) {
      const ang = (i * 45 * Math.PI) / 180
      pts.push({
        lat: lat + (km * Math.cos(ang)) / 111.32,
        lng: lng + (km * Math.sin(ang)) / (111.32 * Math.cos((lat * Math.PI) / 180)),
        km,
        bearing: BEARINGS[i],
      })
    }
  }
  return pts
}

export function analyseTerrain(elev, ring) {
  const e0 = elev[0]
  if (!isNum(e0)) return null
  const around = elev.slice(1).filter(isNum)
  if (!around.length) return { elevation: round(e0, 0), meanNearby: null, relative: null, highGround: null }
  const meanNearby = mean(around)
  let best = null
  ring.forEach((p, i) => {
    const v = elev[i + 1]
    if (isNum(v) && (!best || v > best.elevation)) best = { elevation: v, km: p.km, bearing: p.bearing }
  })
  const highGround =
    best && best.elevation - e0 >= 5 ? { gain: round(best.elevation - e0, 0), km: best.km, bearing: best.bearing } : null
  return { elevation: round(e0, 0), meanNearby: round(meanNearby, 0), relative: round(e0 - meanNearby, 1), highGround }
}

export async function fetchTerrain(lat, lng) {
  const ring = ringPoints(lat, lng)
  const elev = await fetchElevations([[lat, lng], ...ring.map((p) => [p.lat, p.lng])])
  return analyseTerrain(elev, ring)
}

/* ---------- past heavy rain (ERA5) ---------- */

export function analyseRainHistory(times, vals) {
  let n = 0, heavy = 0, veryHeavy = 0, extreme = 0
  const years = new Set()
  const veryHeavyYears = new Set()
  const notable = []
  times.forEach((t, i) => {
    const v = vals[i]
    if (!isNum(v)) return
    n += 1
    years.add(t.slice(0, 4))
    if (v >= RAIN.extreme) extreme += 1
    else if (v >= RAIN.veryHeavy) veryHeavy += 1
    else if (v >= RAIN.heavy) heavy += 1
    if (v >= RAIN.veryHeavy) veryHeavyYears.add(t.slice(0, 4))
    if (v >= RAIN.heavy) notable.push({ date: t, mm: round(v, 0) })
  })
  if (!n) return null
  const yearCount = years.size
  const heavyOrWorse = heavy + veryHeavy + extreme
  return {
    from: times[0],
    to: times[times.length - 1],
    years: yearCount,
    heavyDays: heavy,
    veryHeavyDays: veryHeavy,
    extremeDays: extreme,
    yearsWithVeryHeavy: veryHeavyYears.size,
    // "Frequent" = a very heavy day in at least 1 year of 5, or two heavy days a year on average
    frequent: veryHeavyYears.size / yearCount >= 0.2 || heavyOrWorse / yearCount >= 2,
    top: notable.sort((a, b) => b.mm - a.mm).slice(0, 5),
  }
}

export async function fetchRainHistory(lat, lng, years = HISTORY_YEARS) {
  const k = `rain:${key(lat, lng)}:${years}`
  if (cache.has(k)) return cache.get(k)
  const endYear = new Date().getUTCFullYear() - 1 // whole years only
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    start_date: `${endYear - years + 1}-01-01`,
    end_date: `${endYear}-12-31`,
    daily: 'precipitation_sum',
    timezone: 'auto',
  })
  const data = await getJson(`${URLS.archive}?${q}`, 45000)
  const out = analyseRainHistory(data.daily?.time || [], data.daily?.precipitation_sum || [])
  cache.set(k, out)
  return out
}

/* ---------- rain forecast ---------- */

export function analyseRainForecast(times, vals) {
  // index 0 is yesterday (past_days=1), index 1 is today
  const all = times.map((t, i) => ({ date: t, mm: isNum(vals[i]) ? vals[i] : 0 }))
  const days = all.slice(1)
  if (!days.length) return null
  const next3 = days.slice(0, 3)
  const peak = days.reduce((b, d) => (d.mm > b.mm ? d : b), days[0])
  return {
    yesterday: round(all[0].mm, 0),
    days: days.map((d) => ({ date: d.date, mm: round(d.mm, 0) })),
    max3: round(Math.max(...next3.map((d) => d.mm)), 0),
    sum3: round(next3.reduce((s, d) => s + d.mm, 0), 0),
    max7: round(peak.mm, 0),
    max7Date: peak.date,
  }
}

export async function fetchRainForecast(lat, lng) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: 'precipitation_sum',
    past_days: '1',
    forecast_days: '7',
    timezone: 'auto',
  })
  const data = await getJson(`${URLS.forecast}?${q}`)
  return analyseRainForecast(data.daily?.time || [], data.daily?.precipitation_sum || [])
}

/* ---------- river discharge (GloFAS) ---------- */

export function analyseDischarge(hist, fc, lat, lng) {
  const ht = hist?.daily?.time || []
  const hv = hist?.daily?.river_discharge || []
  const vals = hv.filter(isNum)
  if (vals.length < 365) return null

  const byYear = {}
  ht.forEach((t, i) => {
    const v = hv[i]
    if (!isNum(v)) return
    const y = t.slice(0, 4)
    if (!byYear[y] || v > byYear[y].peak) byYear[y] = { peak: v, date: t }
  })
  const yearRows = Object.entries(byYear).map(([y, o]) => ({ year: Number(y), peak: o.peak, date: o.date }))
  const annualPeak = median(yearRows.map((r) => r.peak).sort((a, b) => a - b))
  const topYears = [...yearRows].sort((a, b) => b.peak - a.peak).slice(0, 3)

  const ft = fc?.daily?.time || []
  const fv = fc?.daily?.river_discharge || []
  let peak = null
  ft.forEach((t, i) => {
    if (i < 1) return // skip yesterday
    const v = fv[i]
    if (isNum(v) && (!peak || v > peak.value)) peak = { date: t, value: v }
  })

  const sorted = [...vals].sort((a, b) => a - b)
  let pct = null
  if (peak) {
    let lo = 0, hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] <= peak.value) lo = mid + 1
      else hi = mid
    }
    pct = (lo / sorted.length) * 100
  }

  const cellKm = isNum(hist?.latitude) ? distanceKm(lat, lng, hist.latitude, hist.longitude) : null
  return {
    applicable: annualPeak >= 5 && !!peak, // tiny streams are too noisy to score
    annualPeak: round(annualPeak, 0),
    forecastPeak: peak ? round(peak.value, 0) : null,
    forecastPeakDate: peak ? peak.date : null,
    ratio: peak ? round(peak.value / annualPeak, 2) : null,
    percentile: round(pct, 0),
    years: yearRows.length,
    maxEver: { value: round(Math.max(...yearRows.map((r) => r.peak)), 0), date: topYears[0].date },
    topYears: topYears.map((r) => ({ year: r.year, peak: round(r.peak, 0), date: r.date })),
    cellKm: round(cellKm, 1),
  }
}

export async function fetchDischarge(lat, lng, years = HISTORY_YEARS) {
  const k = `flow:${key(lat, lng)}:${years}`
  const endYear = new Date().getUTCFullYear() - 1
  const base = { latitude: lat.toFixed(4), longitude: lng.toFixed(4), daily: 'river_discharge' }

  let hist = cache.get(k)
  if (!hist) {
    const q = new URLSearchParams({ ...base, start_date: `${endYear - years + 1}-01-01`, end_date: `${endYear}-12-31` })
    hist = await getJson(`${URLS.flood}?${q}`, 45000)
    cache.set(k, hist)
  }
  const fq = new URLSearchParams({ ...base, past_days: '1', forecast_days: '7' })
  const fc = await getJson(`${URLS.flood}?${fq}`)
  return analyseDischarge(hist, fc, lat, lng)
}

/* ---------- scoring ---------- */

const CLASS_NAME = ['', 'heavy', 'very heavy', 'extremely heavy']

export function assess({ terrain, history, rain, river }) {
  const reasons = []

  // 1. Rain forecast, on the IMD scale
  let rainPts = 0
  if (rain) {
    const m = rain.max3
    rainPts = m >= RAIN.extreme ? 3 : m >= RAIN.veryHeavy ? 2 : m >= RAIN.heavy ? 1 : 0
    reasons.push(
      rainPts
        ? `Forecast: up to ${m} mm of rain in one day within 3 days. IMD calls that ${CLASS_NAME[rainPts]} rain.`
        : `No heavy rain forecast for the next 3 days (at most ${m} mm in a day).`
    )
  }

  // 2. River flow forecast against the typical yearly flood peak at this point
  let flowPts = 0
  if (river?.applicable) {
    const r = river.ratio
    flowPts = r >= 1.5 ? 3 : r >= 1.0 ? 2 : r >= 0.6 ? 1 : 0
    reasons.push(
      flowPts
        ? `River flow is forecast to reach ${river.forecastPeak} m³/s on ${river.forecastPeakDate}, ${r} times the typical yearly peak here (${river.annualPeak} m³/s).`
        : `River flow stays below 60% of the typical yearly peak (${river.annualPeak} m³/s) over the next 7 days.`
    )
  } else if (river) {
    reasons.push('The nearest modelled river is small, so river flow was not used.')
  }

  // 3. Where it happens matters: terrain and history raise the level, never lower it
  const lowLying = !!terrain && (terrain.elevation < 10 || (isNum(terrain.relative) && terrain.relative <= -3))
  const frequent = !!history?.frequent
  if (terrain) {
    reasons.push(
      lowLying
        ? `Low ground: about ${terrain.elevation} m above sea level${
            isNum(terrain.relative) && terrain.relative <= -3 ? `, ${Math.abs(terrain.relative)} m lower than the land around it` : ''
          }. Water collects in places like this.`
        : `About ${terrain.elevation} m above sea level${
            isNum(terrain.relative) && terrain.relative >= 3 ? ', higher than the land around it' : ''
          }.`
    )
  }
  if (history) {
    const heavyOrWorse = history.heavyDays + history.veryHeavyDays + history.extremeDays
    reasons.push(
      `Since ${history.from.slice(0, 4)}, ${history.yearsWithVeryHeavy} of ${history.years} years had a very heavy rain day (${RAIN.veryHeavy} mm or more) and ${heavyOrWorse} days reached ${RAIN.heavy} mm or more.${
        frequent ? ' Heavy rain is frequent here.' : ''
      }`
    )
  }

  let hazard = Math.max(rainPts, flowPts) + (rainPts >= 2 && flowPts >= 2 ? 1 : 0)
  const suscept = hazard > 0 ? (frequent ? 1 : 0) + (lowLying ? 1 : 0) : 0
  if (suscept) {
    const why = [frequent && 'the rain history', lowLying && 'the low ground'].filter(Boolean).join(' and ')
    reasons.push(`Raised by ${suscept} step${suscept > 1 ? 's' : ''} because of ${why}.`)
  }
  const score = hazard > 0 ? hazard + suscept : 0
  const level = score >= 4 ? 'danger' : score >= 2 ? 'warning' : score >= 1 ? 'watch' : 'safe'

  // Drop undefined so the object can be saved to Firestore as is
  return JSON.parse(
    JSON.stringify({
      level,
      score,
      reasons,
      terrain: terrain || null,
      history: history || null,
      river: river || null,
      rain: rain || null,
      computedAt: new Date().toISOString(),
    })
  )
}

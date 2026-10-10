export function homeFor(profile) {
  if (!profile) return '/'
  if (profile.role === 'admin') return '/admin'
  if (profile.role === 'rescuer') {
    if (profile.verificationStatus === 'verified') return '/dashboard'
    if (profile.verificationStatus === 'pending' || profile.verificationStatus === 'rejected') return '/pending'
    return '/verify'
  }
  return '/public'
}

export class TimeoutError extends Error {
  constructor(message) {
    super(message)
    this.code = 'app/timeout'
  }
}

// Firestore writes wait for the server. If something blocks them the promise never settles,
// which looks like a frozen button. This turns that into a visible error.
export function withTimeout(promise, ms, message) {
  let t
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => reject(new TimeoutError(message)), ms)
  })
  return Promise.race([promise, timer]).finally(() => clearTimeout(t))
}

// serverTimestamps:'estimate' stops createdAt showing as null on documents you just wrote
export const docsToList = (snap) =>
  snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))

export function tsToMs(ts) {
  if (!ts) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (ts instanceof Date) return ts.getTime()
  if (typeof ts === 'number') return ts
  return null
}

export function timeAgo(ts, now = Date.now()) {
  const ms = tsToMs(ts)
  if (ms == null) return 'just now'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export const hasLoc = (o) => !!o && typeof o.lat === 'number' && typeof o.lng === 'number'

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export const formatDistance = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`)

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  })
}

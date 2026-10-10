import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useNow } from '../hooks'
import { CAPABILITIES, DEFAULT_CENTER, REQUEST_TYPES, SAFE_ZONE_TYPES } from '../constants'
import { distanceKm, docsToList, getPosition, hasLoc, timeAgo, tsToMs } from '../utils'
import Header from '../components/Header'
import MapView from '../components/MapView'
import Icon from '../components/Icon'
import AudioPlayer from '../components/AudioPlayer'
import { fetchElevations } from '../floodData'

const FILTERS = [
  ['open', 'Open'],
  ['pending', 'Pending'],
  ['accepted', 'Accepted'],
  ['resolved', 'Resolved'],
  ['all', 'All'],
]
const ORDER = { pending: 0, accepted: 1, resolved: 2 }

export default function Dashboard() {
  const { user, profile, logout } = useAuth()
  const isAdmin = profile.role === 'admin'
  const unitName = profile.unitName || profile.email
  const myCaps = useMemo(() => new Set(profile.capabilities || []), [profile.capabilities])
  const [invCounts, setInvCounts] = useState(profile.resourceCounts || {})
  const [invSaving, setInvSaving] = useState(false)

  const [requests, setRequests] = useState([])
  const [zones, setZones] = useState([])
  const [filter, setFilter] = useState('open')
  const [selected, setSelected] = useState(null)
  const [flyTo, setFlyTo] = useState(null)
  const [me, setMe] = useState(null)
  const [pickZone, setPickZone] = useState(false)
  const [draft, setDraft] = useState(null) // {lat, lng, name, type}
  const [draftElev, setDraftElev] = useState(null)
  const [preset, setPreset] = useState('medical')
  const [toast, setToast] = useState('')
  const now = useNow(30000)

  const flash = (text) => {
    setToast(text)
    setTimeout(() => setToast(''), 4000)
  }

  useEffect(() => {
    const onErr = (label) => (err) => { console.error(`${label} listener failed:`, err); flash(`${label}: ${err.message}`) }
    const u1 = onSnapshot(collection(db, 'requests'), (s) => setRequests(docsToList(s)), onErr('requests'))
    const u2 = onSnapshot(collection(db, 'safeZones'), (s) => setZones(docsToList(s)), onErr('safeZones'))
    return () => { u1(); u2() }
  }, [])

  useEffect(() => {
    getPosition().then(setMe).catch(() => {})
  }, [])

  // Ground level of the safe place being placed (higher is safer in a flood)
  useEffect(() => {
    setDraftElev(null)
    if (!draft) return
    let stop = false
    const t = setTimeout(() => {
      fetchElevations([[draft.lat, draft.lng]])
        .then((e) => { if (!stop && typeof e[0] === 'number') setDraftElev(Math.round(e[0])) })
        .catch(() => {})
    }, 400)
    return () => { stop = true; clearTimeout(t) }
  }, [draft?.lat, draft?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Last seen" heartbeat for the resource registry
  useEffect(() => {
    const beat = () =>
      setDoc(doc(db, 'users', user.uid), { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {})
    beat()
    const t = setInterval(beat, 60000)
    return () => clearInterval(t)
  }, [user.uid])

  const counts = useMemo(() => {
    const c = { pending: 0, accepted: 0, resolved: 0 }
    requests.forEach((r) => { if (c[r.status] !== undefined) c[r.status] += 1 })
    return c
  }, [requests])

  // Duplicate-request detection: two reports of the same type, close together in both
  // space and time, are very likely the same real incident reported by different people —
  // not two separate emergencies. Flagging this prevents double-dispatch, a real
  // coordination failure mode where two units head to what's actually one site while
  // something else nearby gets no response at all.
  const DUPLICATE_RADIUS_KM = 0.3 // ~300m
  const DUPLICATE_WINDOW_MS = 20 * 60000 // 20 minutes
  const similarCounts = useMemo(() => {
    const open = requests.filter((r) => r.status !== 'resolved' && hasLoc(r) && tsToMs(r.createdAt))
    const counts = new Map()
    for (let i = 0; i < open.length; i++) {
      let n = 0
      for (let j = 0; j < open.length; j++) {
        if (i === j) continue
        const a = open[i]; const b = open[j]
        if (a.type !== b.type) continue
        if (Math.abs(tsToMs(a.createdAt) - tsToMs(b.createdAt)) > DUPLICATE_WINDOW_MS) continue
        if (distanceKm([a.lat, a.lng], [b.lat, b.lng]) > DUPLICATE_RADIUS_KM) continue
        n++
      }
      if (n > 0) counts.set(open[i].id, n)
    }
    return counts
  }, [requests])

  const visible = useMemo(() => {
    const list = requests.filter((r) => {
      if (filter === 'all') return true
      if (filter === 'open') return r.status !== 'resolved'
      return r.status === filter
    })
    return list.sort((a, b) => {
      if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status]
      const ta = tsToMs(a.createdAt) || 0
      const tb = tsToMs(b.createdAt) || 0
      return a.status === 'pending' ? ta - tb : tb - ta // longest-waiting first
    })
  }, [requests, filter])

  // Where simulated devices appear: your position, else the middle of known points
  const center = useMemo(() => {
    if (me) return me
    const pts = [...requests, ...zones].filter(hasLoc)
    if (pts.length) {
      return [pts.reduce((s, p) => s + p.lat, 0) / pts.length, pts.reduce((s, p) => s + p.lng, 0) / pts.length]
    }
    return DEFAULT_CENTER
  }, [me, requests, zones])

  function selectRequest(id) {
    setSelected(id)
    setTimeout(() => document.getElementById(`req-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  async function accept(r) {
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'requests', r.id)
        const snap = await tx.get(ref)
        if (!snap.exists() || snap.data().status !== 'pending') {
          throw new Error('Another unit already accepted this request.')
        }
        tx.update(ref, { status: 'accepted', acceptedBy: user.uid, acceptedByName: unitName, acceptedAt: serverTimestamp() })
      })
      flash('Accepted. The requester can see that help is coming.')
    } catch (err) {
      console.error(err)
      flash(err.message)
    }
  }

  async function resolve(r) {
    try {
      await updateDoc(doc(db, 'requests', r.id), { status: 'resolved', resolvedAt: serverTimestamp(), resolvedBy: unitName })
      flash('Marked as resolved.')
    } catch (err) {
      console.error(err)
      flash(err.message)
    }
  }

  async function saveInventory() {
    setInvSaving(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), { resourceCounts: invCounts })
      flash('Inventory updated.')
    } catch (err) {
      console.error(err)
      flash(err.message)
    } finally {
      setInvSaving(false)
    }
  }

  async function broadcast() {
    const jitter = () => (Math.random() - 0.5) * 0.02 // about 1 km
    try {
      await addDoc(collection(db, 'requests'), {
        type: preset,
        source: 'mesh',
        status: 'pending',
        lat: center[0] + jitter(),
        lng: center[1] + jitter(),
        deviceId: `LR-${Math.floor(Math.random() * 90) + 10}`,
        hops: Math.floor(Math.random() * 6) + 1,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })
      flash('Virtual field device broadcast sent.')
    } catch (err) {
      console.error(err)
      flash(err.message)
    }
  }

  async function saveZone(e) {
    e.preventDefault()
    try {
      await addDoc(collection(db, 'safeZones'), {
        name: draft.name.trim(),
        type: draft.type,
        lat: draft.lat,
        lng: draft.lng,
        elevation: draftElev,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })
      setDraft(null)
      setPickZone(false)
      flash('Safe place added. The public map shows it now.')
    } catch (err) {
      console.error(err)
      flash(err.message)
    }
  }

  const removeZone = (z) => deleteDoc(doc(db, 'safeZones', z.id)).catch((err) => flash(err.message))

  return (
    <>
      <Header subtitle={isAdmin ? 'Command dashboard' : unitName}>
        {isAdmin && <Link className="btn ghost sm" to="/admin">Control room</Link>}
        <Link className="btn ghost sm" to="/public">Public view</Link>
        <button className="btn ghost sm" onClick={logout}>Sign out</button>
      </Header>

      {toast && <div className="toast" role="status">{toast}</div>}

      <main className="container wide">
        <div className="stats">
          <div className="stat pending"><b>{counts.pending}</b><span>Pending</span></div>
          <div className="stat accepted"><b>{counts.accepted}</b><span>Accepted</span></div>
          <div className="stat resolved"><b>{counts.resolved}</b><span>Resolved</span></div>
        </div>

        <div className="dash-grid">
          <section className="card map-card">
            <div className="row between">
              <h2>Live map</h2>
              <button
                className={`btn sm ${pickZone ? 'primary' : 'outline'}`}
                onClick={() => { setPickZone(!pickZone); setDraft(null) }}
              >
                {pickZone ? 'Cancel' : 'Add a safe place'}
              </button>
            </div>
            <MapView
              requests={visible}
              safeZones={zones}
              me={me}
              draft={draft ? [draft.lat, draft.lng] : null}
              onMapClick={pickZone ? (ll) => setDraft({ lat: ll[0], lng: ll[1], name: draft?.name || '', type: draft?.type || 'shelter' }) : undefined}
              hint={pickZone ? 'Tap the map where the safe place is' : undefined}
              flyTo={flyTo}
              selectedId={selected}
              onSelectRequest={selectRequest}
              height={460}
            />
            {draft && (
              <form className="zone-form" onSubmit={saveZone}>
                <input required placeholder="Name, e.g. Govt. School Relief Camp" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                  {Object.entries(SAFE_ZONE_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
                </select>
                <button className="btn primary">Save safe place</button>
                <small className="zone-elev">
                  {draftElev != null ? `Ground level here: about ${draftElev} m above sea level. Higher is safer.` : 'Looking up ground level…'}
                </small>
              </form>
            )}
            {zones.length > 0 && (
              <details className="zones">
                <summary>Safe places ({zones.length})</summary>
                <ul className="plain">
                  {zones.map((z) => (
                    <li key={z.id}>
                      <span>{SAFE_ZONE_TYPES[z.type]?.glyph} {z.name}{typeof z.elevation === 'number' && <small> ({z.elevation} m)</small>}</span>
                      <span className="row">
                        {hasLoc(z) && <button className="linklike" onClick={() => setFlyTo({ lat: z.lat, lng: z.lng, k: Date.now() })}>Show</button>}
                        <button className="linklike danger" onClick={() => removeZone(z)}>Remove</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="card list-card">
            <h2>Requests</h2>
            <div className="tabs">
              {FILTERS.map(([id, label]) => (
                <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>

            {visible.length === 0 && <p className="fine">No requests here yet. Public SOS messages and field device broadcasts appear live.</p>}

            <ul className="reqs">
              {visible.map((r) => {
                const t = REQUEST_TYPES[r.type]
                const needs = CAPABILITIES.find((c) => c.id === t?.needs)
                const match = t && myCaps.has(t.needs)
                return (
                  <li key={r.id} id={`req-${r.id}`} className={`req ${selected === r.id ? 'sel' : ''}`}>
                    <div className="row between">
                      <span className="req-title"><Icon type={r.type} size={19} />{t?.label || r.type}</span>
                      <span className={`pill ${r.status}`}>{r.status}</span>
                    </div>
                    <div className={`source-badge ${r.source === 'mesh' ? 'source-mesh' : 'source-public'}`}>
                      {r.source === 'mesh'
                        ? `LoRa mesh · ${r.deviceId || 'unknown device'} · ${r.hops || '?'} hops`
                        : 'Public SOS'}
                    </div>
                    <div className="meta">
                      <span>{timeAgo(r.createdAt, now)}</span>
                      {needs && <span>Needs {needs.label.toLowerCase()}</span>}
                      {!hasLoc(r) && <span>No location</span>}
                    </div>
                    {r.partySize > 0 && (
                      <div className="party-info">
                        <span className="party-count"><Icon type="people" size={15} />{r.partySize} {r.partySize === 1 ? 'person' : 'people'}</span>
                        {r.groupElderly && <span className="party-tag">Elderly</span>}
                        {r.groupPregnant && <span className="party-tag">Pregnant</span>}
                        {r.groupChildren && <span className="party-tag">Children</span>}
                      </div>
                    )}
                    {match && r.status === 'pending' && <div className="badge match">Matches your unit</div>}
                    {similarCounts.has(r.id) && (
                      <div className="badge duplicate">
                        {similarCounts.get(r.id) + 1} similar requests nearby — possibly the same incident
                      </div>
                    )}
                    {r.status === 'resolved' && r.resolvedBy === 'self' && (
                      <div className="meta"><span>Marked safe by reporter — no rescuer needed to act on this</span></div>
                    )}
                    {r.acceptedByName && <div className="meta"><span>Accepted by {r.acceptedByName}</span></div>}
                    {(r.audioNote || r.photo) && (
                      <div className="evidence-view">
                        {r.audioNote && (
                          <div className="evidence-view-item">
                            <span className="fine evidence-view-label"><Icon type="mic" size={14} /> Voice note{r.audioSeconds ? ` · ${r.audioSeconds}s` : ''}</span>
                            <AudioPlayer src={r.audioNote} label="Voice note" />
                          </div>
                        )}
                        {r.photo && (
                          <div className="evidence-view-item">
                            <span className="fine evidence-view-label"><Icon type="camera" size={14} /> Photo</span>
                            <img src={r.photo} alt="Sent with the request" className="evidence-photo" />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="row actions">
                      {hasLoc(r) && (
                        <button className="btn sm outline" onClick={() => { setSelected(r.id); setFlyTo({ lat: r.lat, lng: r.lng, k: Date.now() }) }}>
                          Show on map
                        </button>
                      )}
                      {r.status === 'pending' && <button className="btn sm primary" onClick={() => accept(r)}>Accept</button>}
                      {r.status === 'accepted' && (r.acceptedBy === user.uid || isAdmin) && (
                        <button className="btn sm success" onClick={() => resolve(r)}>Mark resolved</button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {!isAdmin && profile.capabilities?.length > 0 && (
              <div className="sim">
                <h3>Resource inventory</h3>
                <p className="fine">
                  Rough counts, not exact stock-taking — lets the control room say "nearest unit with an actual boat" instead of just a tag. Update anytime as supplies run low.
                </p>
                <div className="resource-counts">
                  {profile.capabilities.map((id) => {
                    const c = CAPABILITIES.find((x) => x.id === id)
                    return (
                      <label key={id} className="resource-count-row">
                        {c?.label || id}
                        <input
                          type="number" min="0"
                          value={invCounts[id] ?? ''}
                          onChange={(e) => setInvCounts((v) => ({ ...v, [id]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                        />
                      </label>
                    )
                  })}
                </div>
                <button className="btn outline sm" onClick={saveInventory} disabled={invSaving}>
                  {invSaving ? 'Saving…' : 'Save inventory'}
                </button>
              </div>
            )}

            {!isAdmin && (
              <div className="sim">
                <h3>Virtual field device</h3>
                <p className="fine">Stands in for a LoRa device. Sends a preset message that appears here as if it had hopped across the mesh.</p>
                <div className="row">
                  <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                    {Object.entries(REQUEST_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
                  </select>
                  <button className="btn outline" onClick={broadcast}>Broadcast</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

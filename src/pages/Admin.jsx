import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useNow } from '../hooks'
import { CAPABILITIES, HAZARD_LEVELS, REQUEST_TYPES, RESCUER_TYPES } from '../constants'
import { docsToList, timeAgo, tsToMs } from '../utils'
import Header from '../components/Header'
import FloodPanel from '../components/FloodPanel'

const typeLabel = (id) => RESCUER_TYPES.find((t) => t.id === id)?.label || id
const capLabel = (id) => CAPABILITIES.find((c) => c.id === id)?.label || id

export default function Admin() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('verify')
  const [rescuers, setRescuers] = useState([])
  const [requests, setRequests] = useState([])
  const [hazard, setHazard] = useState(null)
  const [hazardMsg, setHazardMsg] = useState('')
  const [threshold, setThreshold] = useState(10)
  const [toast, setToast] = useState('')
  const now = useNow(15000)

  const flash = (text) => {
    setToast(text)
    setTimeout(() => setToast(''), 4000)
  }

  useEffect(() => {
    const onErr = (label) => (err) => { console.error(`${label} listener failed:`, err); flash(`${label}: ${err.message}`) }
    const u1 = onSnapshot(query(collection(db, 'users'), where('role', '==', 'rescuer')), (s) => setRescuers(docsToList(s)), onErr('users'))
    const u2 = onSnapshot(collection(db, 'requests'), (s) => setRequests(docsToList(s)), onErr('requests'))
    const u3 = onSnapshot(doc(db, 'hazard', 'current'), (s) => setHazard(s.exists() ? s.data() : null), onErr('hazard'))
    return () => { u1(); u2(); u3() }
  }, [])

  const pending = useMemo(() => rescuers.filter((r) => r.verificationStatus === 'pending'), [rescuers])
  const verified = useMemo(() => rescuers.filter((r) => r.verificationStatus === 'verified'), [rescuers])

  const escalated = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'pending' && tsToMs(r.createdAt) && now - tsToMs(r.createdAt) > threshold * 60000)
        .sort((a, b) => tsToMs(a.createdAt) - tsToMs(b.createdAt)),
    [requests, now, threshold]
  )

  async function review(u, status) {
    try {
      await updateDoc(doc(db, 'users', u.id), { verificationStatus: status, reviewedAt: serverTimestamp(), reviewedBy: user.email })
      flash(status === 'verified' ? `${u.unitName || u.email} approved.` : `${u.unitName || u.email} rejected.`)
    } catch (err) {
      console.error(err)
      flash(err.message)
    }
  }

  async function closeManually(r) {
    try {
      await updateDoc(doc(db, 'requests', r.id), { status: 'resolved', resolvedAt: serverTimestamp(), resolvedBy: 'control room' })
    } catch (err) {
      flash(err.message)
    }
  }

  // Manual override: clears any place-specific assessment so old reasoning (e.g. "Danger" reasons
  // from a prior Analyse) can't linger on screen under a level you've since changed by hand.
  async function setLevel(level) {
    try {
      await setDoc(
        doc(db, 'hazard', 'current'),
        {
          level,
          message: hazardMsg.trim() || HAZARD_LEVELS[level].text,
          levelSource: 'manual',
          area: null,
          assessment: null,
          updatedAt: serverTimestamp(),
          updatedBy: user.email,
        },
        { merge: true }
      )
      flash(`Flood status set to ${HAZARD_LEVELS[level].label}. Public screens update live.`)
    } catch (err) {
      console.error(err)
      flash(err.message)
    }
  }

  // Apply the analysed level together with the place, elevation and history behind it
  async function applyAssessment({ level, message, area, assessment }) {
    try {
      await setDoc(doc(db, 'hazard', 'current'), {
        level,
        message: hazardMsg.trim() || message,
        levelSource: 'assessment',
        area,
        assessment,
        updatedAt: serverTimestamp(),
        updatedBy: user.email,
      })
      flash(`${HAZARD_LEVELS[level].label} applied for ${area.name}. Public screens update live.`)
    } catch (err) {
      console.error(err)
      flash(err.message)
    }
  }

  // One-click dated record of everything handled in this session, for a real
  // deployment's accountability trail. Built client-side from the same requests data
  // already loaded for the dashboard/registry — no server round-trip needed.
  function exportIncidentLog() {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const left = 40
    let y = 50
    const pageH = pdf.internal.pageSize.getHeight()
    const lineH = 14

    function line(text, opts = {}) {
      if (y > pageH - 50) { pdf.addPage(); y = 50 }
      pdf.setFont(undefined, opts.bold ? 'bold' : 'normal')
      pdf.setFontSize(opts.size || 10)
      pdf.text(text, left + (opts.indent || 0), y)
      y += opts.gap || lineH
    }

    pdf.setFontSize(16)
    pdf.setFont(undefined, 'bold')
    pdf.text('Varman — Incident Log', left, y)
    y += 22
    line(`Exported ${new Date().toLocaleString()} by ${user.email}`, { size: 9 })
    y += 6

    const sorted = [...requests].sort((a, b) => (tsToMs(a.createdAt) || 0) - (tsToMs(b.createdAt) || 0))
    const counts = { pending: 0, accepted: 0, resolved: 0 }
    sorted.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1 })
    line(`Total requests: ${sorted.length}  (${counts.pending} pending, ${counts.accepted} accepted, ${counts.resolved} resolved)`, { bold: true })
    y += 8

    sorted.forEach((r, i) => {
      const createdStr = r.createdAt ? new Date(tsToMs(r.createdAt)).toLocaleString() : 'unknown time'
      line(`${i + 1}. ${REQUEST_TYPES[r.type]?.label || r.type} — ${r.status.toUpperCase()}`, { bold: true, size: 11, gap: 16 })
      line(`Source: ${r.source === 'mesh' ? `Field device ${r.deviceId || ''}` : 'Public SOS'}   Created: ${createdStr}`, { indent: 14, size: 9 })
      if (r.lat != null && r.lng != null) {
        line(`Location: ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`, { indent: 14, size: 9 })
      }
      if (r.partySize > 0) {
        const tags = [r.groupElderly && 'elderly', r.groupPregnant && 'pregnant', r.groupChildren && 'children'].filter(Boolean)
        line(`Party: ${r.partySize} people${tags.length ? ` (${tags.join(', ')})` : ''}`, { indent: 14, size: 9 })
      }
      if (r.acceptedByName) {
        const acceptedStr = r.acceptedAt ? new Date(tsToMs(r.acceptedAt)).toLocaleString() : ''
        line(`Accepted by: ${r.acceptedByName}${acceptedStr ? ` at ${acceptedStr}` : ''}`, { indent: 14, size: 9 })
      }
      if (r.status === 'resolved') {
        const resolvedStr = r.resolvedAt ? new Date(tsToMs(r.resolvedAt)).toLocaleString() : ''
        const by = r.resolvedBy === 'self' ? 'reporter (marked safe)' : r.resolvedBy || 'control room'
        line(`Resolved by: ${by}${resolvedStr ? ` at ${resolvedStr}` : ''}`, { indent: 14, size: 9 })
      }
      y += 6
    })

    pdf.save(`varman-incident-log-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const tabs = [
    ['verify', `Verification${pending.length ? ` (${pending.length})` : ''}`],
    ['escalate', `Escalations${escalated.length ? ` (${escalated.length})` : ''}`],
    ['registry', 'Units'],
    ['hazard', 'Flood status'],
  ]

  return (
    <>
      <Header subtitle="Control room">
        <button className="btn ghost sm" onClick={exportIncidentLog}>Export incident log (PDF)</button>
        <Link className="btn ghost sm" to="/dashboard">Command dashboard</Link>
        <button className="btn ghost sm" onClick={logout}>Sign out</button>
      </Header>
      {toast && <div className="toast" role="status">{toast}</div>}

      <main className="container">
        <div className="tabs big">
          {tabs.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'verify' && (
          <section className="card">
            <h2>Rescuers waiting for verification</h2>
            {pending.length === 0 && <p className="fine">Nobody is waiting. New rescuer sign-ups appear here live.</p>}
            <ul className="reqs">
              {pending.map((u) => (
                <li key={u.id} className="req">
                  <div className="row between">
                    <strong>{u.unitName || u.email}</strong>
                    <span className="badge">{typeLabel(u.rescuerType)}</span>
                  </div>
                  <div className="meta">
                    <span>{u.email}</span>
                    <span>ID: {u.idNumber || 'not given'}</span>
                    <span>Submitted {timeAgo(u.submittedAt, now)}</span>
                  </div>
                  <div className="chips static">
                    {(u.capabilities || []).map((c) => <span key={c} className="chip on">{capLabel(c)}</span>)}
                  </div>
                  {u.idPhotoUrl && (
                    <a href={u.idPhotoUrl} target="_blank" rel="noreferrer" className="idphoto">
                      <img src={u.idPhotoUrl} alt="ID submitted by rescuer" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                      Open ID photo
                    </a>
                  )}
                  <div className="row actions">
                    <button className="btn primary" onClick={() => review(u, 'verified')}>Approve</button>
                    <button className="btn outline danger" onClick={() => review(u, 'rejected')}>Reject</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'escalate' && (
          <section className="card">
            <div className="row between">
              <h2>Requests nobody has accepted</h2>
              <label className="inline">
                Escalate after
                <input type="number" min="1" max="240" value={threshold} onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))} />
                min
              </label>
            </div>
            {escalated.length === 0 && <p className="fine">Nothing has been waiting longer than {threshold} minutes.</p>}
            <ul className="reqs">
              {escalated.map((r) => (
                <li key={r.id} className="req sel">
                  <div className="row between">
                    <strong>{REQUEST_TYPES[r.type]?.label || r.type}</strong>
                    <span className="pill pending">waiting {Math.round((now - tsToMs(r.createdAt)) / 60000)} min</span>
                  </div>
                  <div className="meta">
                    <span>{r.source === 'mesh' ? `Field device ${r.deviceId || ''}` : 'Public SOS'}</span>
                    <span>Needs {capLabel(REQUEST_TYPES[r.type]?.needs)}</span>
                  </div>
                  {(() => {
                    const needsId = REQUEST_TYPES[r.type]?.needs
                    const withStock = verified.filter((u) => (u.resourceCounts?.[needsId] || 0) > 0)
                    if (!needsId) return null
                    return withStock.length > 0 ? (
                      <p className="fine">
                        Units with {capLabel(needsId).toLowerCase()} in stock:{' '}
                        {withStock.map((u) => `${u.unitName || u.email} (${u.resourceCounts[needsId]})`).join(', ')}
                      </p>
                    ) : (
                      <p className="fine">No verified unit currently reports {capLabel(needsId).toLowerCase()} in stock.</p>
                    )
                  })()}
                  <div className="row actions">
                    <button className="btn sm outline" onClick={() => closeManually(r)}>Mark resolved</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'registry' && (
          <section className="card">
            <h2>Verified units</h2>
            {verified.length === 0 && <p className="fine">No verified units yet.</p>}
            <ul className="reqs">
              {verified.map((u) => {
                const seen = tsToMs(u.lastSeen)
                const live = seen && now - seen < 3 * 60000
                return (
                  <li key={u.id} className="req">
                    <div className="row between">
                      <strong>{u.unitName || u.email}</strong>
                      <span className={`pill ${live ? 'resolved' : 'muted'}`}>{live ? 'online' : 'offline'}</span>
                    </div>
                    <div className="meta">
                      <span>{typeLabel(u.rescuerType)}</span>
                      <span>Last seen {seen ? timeAgo(u.lastSeen, now) : 'never'}</span>
                    </div>
                    <div className="chips static">
                      {(u.capabilities || []).map((c) => {
                        const n = u.resourceCounts?.[c]
                        return (
                          <span key={c} className="chip on">
                            {capLabel(c)}{n != null ? `: ${n}` : ''}
                          </span>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {tab === 'hazard' && (
          <section className="card">
            <h2>Flood status</h2>
            <p>
              Current level: <strong>{HAZARD_LEVELS[hazard?.level]?.label || 'Safe (not set)'}</strong>
              {hazard?.area?.name && <> for {hazard.area.name}</>}
              {hazard?.levelSource === 'manual' && ' (set by hand)'}.
              Analyse a place to get a level based on its elevation, its history of heavy rain and river flow,
              and the forecast. Or set a level by hand below.
            </p>
            <FloodPanel current={hazard} onApply={applyAssessment} />

            <hr className="sep" />
            <h3>Set the level by hand</h3>
            <label>
              Message for the public (optional, also used when applying an analysed level)
              <input value={hazardMsg} onChange={(e) => setHazardMsg(e.target.value)} placeholder="Leave empty to use the standard message" />
            </label>
            <div className="level-buttons">
              {Object.entries(HAZARD_LEVELS).map(([id, l]) => (
                <button key={id} className="btn lg" style={{ background: l.color, color: '#fff' }} onClick={() => setLevel(id)}>
                  {l.label}
                </button>
              ))}
            </div>
            <p className="fine">These fully replace the current status — click any button anytime to move the level up or down; it's never a one-way ratchet.</p>
          </section>
        )}
      </main>
    </>
  )
}

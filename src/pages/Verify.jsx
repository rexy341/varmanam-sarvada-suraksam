import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { CAPABILITIES, RESCUER_TYPES } from '../constants'
import { withTimeout } from '../utils'
import Header from '../components/Header'

export default function Verify() {
  const { user, profile, logout } = useAuth()
  const nav = useNavigate()
  const [rescuerType, setRescuerType] = useState(profile.rescuerType || 'ndrf')
  const [unitName, setUnitName] = useState(profile.unitName || '')
  const [idNumber, setIdNumber] = useState(profile.idNumber || '')
  const [idPhotoUrl, setIdPhotoUrl] = useState(profile.idPhotoUrl || '')
  const [capabilities, setCapabilities] = useState(profile.capabilities || [])
  const [resourceCounts, setResourceCounts] = useState(profile.resourceCounts || {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const idLabel = RESCUER_TYPES.find((t) => t.id === rescuerType)?.idLabel || 'ID number'

  const toggleCap = (id) =>
    setCapabilities((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  const setCount = (id, n) =>
    setResourceCounts((r) => ({ ...r, [id]: Math.max(0, n) }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (capabilities.length === 0) return setError('Select at least one thing your unit can provide.')
    setBusy(true)
    try {
      await withTimeout(
        setDoc(
          doc(db, 'users', user.uid),
          {
            rescuerType,
            unitName: unitName.trim(),
            idNumber: idNumber.trim(),
            idPhotoUrl: idPhotoUrl.trim(),
            capabilities,
            resourceCounts,
            verificationStatus: 'pending',
            submittedAt: serverTimestamp(),
          },
          { merge: true }
        ),
        10000,
        'Saving took more than 10 seconds. Check your connection and the Firestore rules.'
      )
      nav('/pending')
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Header subtitle="Rescuer verification">
        <button className="btn ghost sm" onClick={logout}>Sign out</button>
      </Header>
      <main className="container narrow">
        <section className="card">
          <h2>Verify your unit</h2>
          <p>The control room checks these details before your account can see or accept requests.</p>
          <form onSubmit={submit} className="stack">
            <label>
              Service
              <select value={rescuerType} onChange={(e) => setRescuerType(e.target.value)}>
                {RESCUER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label>
              Unit or organisation name
              <input required value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="e.g. SDRF Battalion 3, Red Cross Chennai" />
            </label>
            <label>
              {idLabel}
              <input required value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
            </label>
            <label>
              Link to a photo of your ID
              <input type="url" required value={idPhotoUrl} onChange={(e) => setIdPhotoUrl(e.target.value)} placeholder="https://i.imgur.com/…" />
              <small>Upload the photo to imgur.com or postimages.org and paste the direct link.</small>
            </label>
            <fieldset>
              <legend>What can your unit provide?</legend>
              <div className="chips">
                {CAPABILITIES.map((c) => (
                  <label key={c.id} className={`chip ${capabilities.includes(c.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={capabilities.includes(c.id)} onChange={() => toggleCap(c.id)} />
                    {c.label}
                  </label>
                ))}
              </div>
              {capabilities.length > 0 && (
                <div className="resource-counts">
                  <p className="fine">
                    Rough counts help the control room say "nearest unit with an actual boat," not just a tag. You can update these anytime from your dashboard.
                  </p>
                  {capabilities.map((id) => {
                    const c = CAPABILITIES.find((x) => x.id === id)
                    return (
                      <label key={id} className="resource-count-row">
                        {c?.label || id}
                        <input
                          type="number" min="0" placeholder="e.g. 3"
                          value={resourceCounts[id] ?? ''}
                          onChange={(e) => setCount(id, parseInt(e.target.value, 10) || 0)}
                        />
                      </label>
                    )
                  })}
                </div>
              )}
            </fieldset>
            {error && <div className="notice error">{error}</div>}
            <button className="btn primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
          </form>
        </section>
      </main>
    </>
  )
}

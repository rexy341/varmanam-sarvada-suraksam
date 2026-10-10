import { useEffect, useState } from 'react'
import { HAZARD_FORECAST_TEXT, HAZARD_LEVELS } from '../constants'
import {
  assess, fetchDischarge, fetchRainForecast, fetchRainHistory, fetchTerrain, searchPlaces,
} from '../floodData'
import MapView from './MapView'
import AssessmentDetails from './AssessmentDetails'

// Control-room tool: pick a place, pull elevation + past heavy rain + river history + forecasts,
// get a suggested flood level with reasons, and apply it to every public screen.
export default function FloodPanel({ current, onApply }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [place, setPlace] = useState(null) // {name, lat, lng, custom?}
  const [note, setNote] = useState('')
  const [flyTo, setFlyTo] = useState(null)
  const [busy, setBusy] = useState('') // '', 'search', 'analyse', 'apply'
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState([])
  const [analysis, setAnalysis] = useState(null)

  // Start from the place that is already being monitored
  useEffect(() => {
    if (!place && current?.area?.lat != null) {
      setPlace({ name: current.area.name, lat: current.area.lat, lng: current.area.lng })
      setNote(current.area.note || '')
      setFlyTo({ lat: current.area.lat, lng: current.area.lng, zoom: 11, k: Date.now() })
    }
  }, [current, place])

  async function search(e) {
    e.preventDefault()
    if (q.trim().length < 2) return
    setBusy('search')
    setError('')
    try {
      const r = await searchPlaces(q)
      setResults(r)
      if (!r.length) setError('No place found. Try another spelling, or tap the map.')
    } catch (err) {
      setError(`Search failed: ${err.message}`)
    } finally {
      setBusy('')
    }
  }

  function choose(r) {
    const name = [r.name, r.admin1].filter(Boolean).join(', ')
    setPlace({ name, lat: r.lat, lng: r.lng })
    setResults([])
    setAnalysis(null)
    setFlyTo({ lat: r.lat, lng: r.lng, zoom: 11, k: Date.now() })
  }

  function pickOnMap([lat, lng]) {
    setPlace((p) => ({
      name: p?.custom ? p.name : `Map point ${lat.toFixed(3)}, ${lng.toFixed(3)}`,
      lat,
      lng,
      custom: true,
    }))
    setAnalysis(null)
  }

  async function analyse() {
    setBusy('analyse')
    setError('')
    setWarnings([])
    setAnalysis(null)
    const { lat, lng } = place
    const parts = await Promise.allSettled([
      fetchTerrain(lat, lng),
      fetchRainHistory(lat, lng),
      fetchRainForecast(lat, lng),
      fetchDischarge(lat, lng),
    ])
    const names = ['Elevation', 'Rain history', 'Rain forecast', 'River data']
    const warn = []
    parts.forEach((p, i) => {
      if (p.status === 'rejected') warn.push(`${names[i]} unavailable: ${p.reason?.message || 'request failed'}`)
      else if (p.value == null) warn.push(i === 3 ? 'No modelled river near this point, so river flow was not used.' : `${names[i]}: no data for this point.`)
    })
    const [terrain, history, rain, river] = parts.map((p) => (p.status === 'fulfilled' ? p.value : null))
    setWarnings(warn)
    if (!rain && !river) {
      setError('Could not get a rain or river forecast for this place. Check your internet connection and try again.')
    } else {
      setAnalysis(assess({ terrain, history, rain, river }))
    }
    setBusy('')
  }

  async function apply() {
    setBusy('apply')
    try {
      await onApply({
        level: analysis.level,
        message: `${place.name}: ${HAZARD_FORECAST_TEXT[analysis.level]}`,
        area: { name: place.name, lat: place.lat, lng: place.lng, note: note.trim() },
        assessment: analysis,
      })
    } finally {
      setBusy('')
    }
  }

  const shown = analysis || (current?.assessment && current.area?.lat === place?.lat ? current.assessment : null)
  const lv = analysis ? HAZARD_LEVELS[analysis.level] : null

  return (
    <div className="flood-panel">
      <h3>1. Choose the place</h3>
      <form className="row search" onSubmit={search}>
        <input placeholder="Search a city or locality, e.g. Adyar, Chennai" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn outline" disabled={busy === 'search'}>{busy === 'search' ? 'Searching…' : 'Search'}</button>
      </form>
      {results.length > 0 && (
        <ul className="plain picks">
          {results.map((r) => (
            <li key={r.id ?? `${r.lat},${r.lng}`}>
              <span>{[r.name, r.admin1, r.country].filter(Boolean).join(', ')}</span>
              <button className="btn sm outline" onClick={() => choose(r)}>Use</button>
            </li>
          ))}
        </ul>
      )}

      <MapView
        draft={place ? [place.lat, place.lng] : null}
        onMapClick={pickOnMap}
        hint="Tap the map to pick the exact spot"
        flyTo={flyTo}
        legend={false}
        height={260}
      />

      {place && (
        <div className="stack place-form">
          <label>
            Area name shown to the public
            <input value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value, custom: true })} />
          </label>
          <label>
            Local flood record (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Waterlogged in Nov 2015 and Dec 2023 (from municipal records)"
            />
            <small>Type only what you can source. It is shown to the public next to the model data.</small>
          </label>
          <button className="btn primary" onClick={analyse} disabled={busy === 'analyse'}>
            {busy === 'analyse' ? 'Fetching elevation, rain and river data…' : '2. Analyse this place'}
          </button>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}
      {warnings.map((w) => <div key={w} className="notice">{w}</div>)}

      {lv && (
        <div className="suggest" style={{ '--lv': lv.color }}>
          <div className="hazard-level">{lv.label}</div>
          <div>
            <strong>Suggested level for {place.name}</strong>
            <p>{HAZARD_FORECAST_TEXT[analysis.level]}</p>
            <button className="btn primary" onClick={apply} disabled={busy === 'apply'}>
              {busy === 'apply' ? 'Applying…' : `Apply ${lv.label} to all public screens`}
            </button>
          </div>
        </div>
      )}

      {shown && !analysis && <p className="fine">Showing the assessment that is currently applied.</p>}
      <AssessmentDetails assessment={shown} />
    </div>
  )
}

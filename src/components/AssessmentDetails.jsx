import { HAZARD_LEVELS } from '../constants'
import { RAIN } from '../floodData'

const n = (v) => (v == null ? 'n/a' : Number(v).toLocaleString('en-IN'))
const barClass = (mm) => (mm >= RAIN.extreme ? 'x' : mm >= RAIN.veryHeavy ? 'vh' : mm >= RAIN.heavy ? 'h' : '')

// Shows why a flood level was suggested, plus the past-flood, elevation and river facts behind it.
// Used by the control room (after Analyse) and by the public screen (under "How this was assessed").
export default function AssessmentDetails({ assessment: a }) {
  if (!a) return null
  const { terrain, history, river, rain } = a
  const lv = HAZARD_LEVELS[a.level]

  return (
    <div className="assess">
      <h3>Why {lv ? lv.label : 'this level'}</h3>
      <ul className="reasons">
        {(a.reasons || []).map((r) => <li key={r}>{r}</li>)}
      </ul>

      {terrain && (
        <>
          <h3>Ground level</h3>
          <p>
            About <strong>{n(terrain.elevation)} m</strong> above sea level
            {terrain.meanNearby != null && <> (the land within 3 km averages {n(terrain.meanNearby)} m)</>}.
            {terrain.highGround && (
              <> Higher ground: about {terrain.highGround.gain} m higher, {terrain.highGround.km} km to the {terrain.highGround.bearing}.</>
            )}
          </p>
        </>
      )}

      {history && (
        <>
          <h3>Past heavy rain here</h3>
          <p>
            {history.from.slice(0, 4)} to {history.to.slice(0, 4)}: {history.extremeDays} extremely heavy,{' '}
            {history.veryHeavyDays} very heavy and {history.heavyDays} heavy rain days.
          </p>
          {history.top?.length > 0 && (
            <table className="tbl">
              <thead><tr><th>Wettest days</th><th>Rain in 24 h</th></tr></thead>
              <tbody>
                {history.top.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.mm} mm</td></tr>)}
              </tbody>
            </table>
          )}
        </>
      )}

      {river?.applicable && (
        <>
          <h3>River flow (modelled)</h3>
          <p>
            Highest flow in the model's {river.years} years of history: <strong>{n(river.maxEver.value)} m³/s</strong> on {river.maxEver.date}.
            Biggest yearly peaks: {river.topYears.map((y) => `${y.year} (${n(y.peak)})`).join(', ')}.
          </p>
          <p>
            Next 7 days: peak {n(river.forecastPeak)} m³/s on {river.forecastPeakDate}, higher than {river.percentile}% of all days on record.
            {river.cellKm > 8 && <> The model's nearest river cell is {river.cellKm} km away, so treat this with care.</>}
          </p>
        </>
      )}

      {rain?.days && (
        <>
          <h3>Rain forecast</h3>
          <ul className="forecast">
            {rain.days.map((d) => (
              <li key={d.date}>
                <span>{d.date.slice(5)}</span>
                <span className="bar"><i className={barClass(d.mm)} style={{ width: `${Math.min(100, (d.mm / RAIN.veryHeavy) * 100)}%` }} /></span>
                <span>{d.mm} mm</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="fine">
        Advisory only. Rain history is modelled (ERA5, a grid of about 25 km) and usually understates local extremes.
        River data is a 5 km GloFAS model and can miss small urban drains. Confirm with CWC and IMD before acting.
        Data: Open-Meteo.com, ERA5, GloFAS, Copernicus DEM.
        {a.computedAt && <> Assessed {new Date(a.computedAt).toLocaleString()}.</>}
      </p>
    </div>
  )
}

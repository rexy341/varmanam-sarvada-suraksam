import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useOnline } from '../hooks'
import { useLang } from '../i18n'
import { HAZARD_FORECAST_TEXT, HAZARD_LEVELS, TIPS } from '../constants'
import { distanceKm, docsToList, formatDistance, getPosition, hasLoc } from '../utils'
import Header from '../components/Header'
import MapView from '../components/MapView'
import AssessmentDetails from '../components/AssessmentDetails'
import { assess, fetchDischarge, fetchElevations, fetchRainForecast, fetchRainHistory, fetchTerrain } from '../floodData'

// No login required. Shows exactly the information that's the same for anyone who opens
// it — hazard level for wherever they are, safe places, and safety tips — without
// requiring an account. SOS sending, evidence capture and "your requests" stay behind
// login, since those are tied to a specific person's account.
export default function PublicMap() {
  const online = useOnline()
  const { t } = useLang()

  const [hazard, setHazard] = useState(null)
  const [zones, setZones] = useState([])
  const [me, setMe] = useState(null)
  const [myElev, setMyElev] = useState(null)
  const [myAssessment, setMyAssessment] = useState(null)
  const [assessStatus, setAssessStatus] = useState('idle')
  const [locNote, setLocNote] = useState(t('ph_locFinding'))
  const [phase, setPhase] = useState('before')

  useEffect(() => {
    const onErr = (label) => (err) => console.error(`${label} listener failed:`, err)
    const u1 = onSnapshot(doc(db, 'hazard', 'current'), (s) => setHazard(s.exists() ? s.data() : null), onErr('hazard'))
    const u2 = onSnapshot(collection(db, 'safeZones'), (s) => setZones(docsToList(s)), onErr('safeZones'))
    return () => { u1(); u2() }
  }, [])

  useEffect(() => {
    getPosition()
      .then((p) => { setMe(p); setLocNote(t('ph_locFound')) })
      .catch(() => setLocNote(t('ph_locFailed')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setMyElev(null)
    if (!me || !navigator.onLine) return
    let stop = false
    const tmr = setTimeout(() => {
      fetchElevations([me]).then((e) => { if (!stop && typeof e[0] === 'number') setMyElev(Math.round(e[0])) }).catch(() => {})
    }, 600)
    return () => { stop = true; clearTimeout(tmr) }
  }, [me])

  const checkMyArea = useCallback(async (pos) => {
    if (!pos) return
    if (!navigator.onLine) { setAssessStatus('offline'); return }
    setAssessStatus('loading')
    const [lat, lng] = pos
    const parts = await Promise.allSettled([
      fetchTerrain(lat, lng),
      fetchRainHistory(lat, lng),
      fetchRainForecast(lat, lng),
      fetchDischarge(lat, lng),
    ])
    const [terrain, history, rain, river] = parts.map((p) => (p.status === 'fulfilled' ? p.value : null))
    if (!rain && !river) { setAssessStatus('error'); return }
    setMyAssessment(assess({ terrain, history, rain, river }))
    setAssessStatus('ready')
  }, [])

  useEffect(() => {
    if (!me) { setAssessStatus('idle'); return }
    const tmr = setTimeout(() => checkMyArea(me), 500)
    return () => clearTimeout(tmr)
  }, [me, checkMyArea])

  const NEARBY_KM = 50
  const distToHazard = me && hazard?.area?.lat != null && hazard?.area?.lng != null
    ? distanceKm(me, [hazard.area.lat, hazard.area.lng])
    : null
  const overrideApplies = !!hazard?.area && (distToHazard == null || distToHazard <= NEARBY_KM)
  const autoReady = assessStatus === 'ready' && !!myAssessment

  const level = overrideApplies
    ? (HAZARD_LEVELS[hazard.level] ? hazard.level : 'safe')
    : autoReady && HAZARD_LEVELS[myAssessment.level] ? myAssessment.level : null
  const lv = level ? HAZARD_LEVELS[level] : { label: t('ph_checking'), color: '#868e96', text: '' }

  useEffect(() => {
    setPhase(level === 'danger' ? 'during' : 'before')
  }, [level])

  const nearest = useMemo(() => {
    if (!me) return []
    return zones
      .filter(hasLoc)
      .map((z) => ({ ...z, km: distanceKm(me, [z.lat, z.lng]) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 4)
  }, [me, zones])

  return (
    <>
      <Header subtitle={t('ph_subtitle')}>
        <Link className="btn primary sm" to="/">{t('auth_login')}</Link>
      </Header>

      {!online && <div className="banner offline">{t('ph_offlineBanner')}</div>}

      <main className="container">
        <div className="notice">
          {t('ph_loginPrompt')} <Link to="/">{t('auth_login')}</Link>
        </div>

        <section className="card hazard" style={{ '--lv': lv.color }}>
          <div className="hazard-level">{level ? t(`level_${level}`) : t('ph_checking')}</div>
          <div>
            {overrideApplies ? (
              <>
                <h2>{t('ph_floodStatus')} {hazard?.area?.name ? `${t('ph_for')} ${hazard.area.name}` : t('ph_forYourArea')}</h2>
                <p>{hazard?.message || lv.text}</p>
                {hazard?.area?.note && <p className="fine">{t('ph_localRecord')} {hazard.area.note}</p>}
                <p className="fine">{t('ph_setByControlRoom')}</p>
              </>
            ) : autoReady ? (
              <>
                <h2>{t('ph_floodStatus')} {t('ph_forYourArea')}</h2>
                <p>{HAZARD_FORECAST_TEXT[myAssessment.level] || lv.text}</p>
                <p className="fine">{t('ph_autoAssessed')}</p>
              </>
            ) : (
              <>
                <h2>{t('ph_floodStatus')} {t('ph_forYourArea')}</h2>
                <p className="fine">
                  {assessStatus === 'loading' && t('ph_checkingArea')}
                  {assessStatus === 'idle' && t('ph_needLocationAuto')}
                  {assessStatus === 'offline' && t('ph_assessOffline')}
                  {assessStatus === 'error' && t('ph_assessFailed')}
                </p>
              </>
            )}
            {!overrideApplies && me && (assessStatus === 'ready' || assessStatus === 'error') && (
              <button type="button" className="linklike" onClick={() => checkMyArea(me)}>{t('ph_recheck')}</button>
            )}
            {!overrideApplies && hazard?.area && distToHazard != null && (
              <p className="fine">
                {t('ph_nearestAssessed')}: {hazard.area.name} ({formatDistance(distToHazard)} {t('ph_away')}) — {t(`level_${HAZARD_LEVELS[hazard.level] ? hazard.level : 'safe'}`)}
              </p>
            )}
          </div>
        </section>
        {(overrideApplies ? hazard?.assessment : myAssessment) && (
          <details className="card why">
            <summary>{t('ph_howAssessed')}</summary>
            <AssessmentDetails assessment={overrideApplies ? hazard.assessment : myAssessment} />
          </details>
        )}

        <section className="card">
          <h2>{t('ph_safePlaces')}</h2>
          <MapView
            safeZones={zones}
            requests={[]}
            me={me}
            onMapClick={setMe}
            hint={t('ph_tapMapHint')}
            height={340}
          />
          {zones.length === 0 ? (
            <p className="fine">{t('ph_noSafePlaces')}</p>
          ) : nearest.length > 0 ? (
            <>
              {myElev != null && <p className="fine">{t('ph_groundLevelPrefix')} {myElev} {t('ph_metersAboveSea')}</p>}
              <ul className="plain">
                {nearest.map((z) => {
                  const d = myElev != null && typeof z.elevation === 'number' ? z.elevation - myElev : null
                  return (
                    <li key={z.id}>
                      <span>
                        <strong>{z.name}</strong>
                        {d != null && (
                          <small>
                            {d >= 2 ? `${Math.round(d)} ${t('ph_higherThanYou')}` : d <= -2 ? `${Math.round(-d)} ${t('ph_lowerThanYou')}` : t('ph_aboutSameLevel')}
                          </small>
                        )}
                      </span>
                      <span>{formatDistance(z.km)} {t('ph_away')}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p className="fine">{t('ph_setLocToSeeNearest')}</p>
          )}
          <p className="fine">{locNote}</p>
        </section>

        <section className="card">
          <h2>{t('ph_safetyTips')}</h2>
          <div className="tabs" role="tablist">
            {[['before', t('ph_before')], ['during', t('ph_during')], ['after', t('ph_after')]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={phase === id} className={phase === id ? 'on' : ''} onClick={() => setPhase(id)}>
                {label}
              </button>
            ))}
          </div>
          <ul className="tips">
            {TIPS[phase].map((tp) => <li key={tp}>{tp}</li>)}
          </ul>
        </section>
      </main>
    </>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useOnline } from '../hooks'
import { useLang } from '../i18n'
import { HAZARD_FORECAST_TEXT, HAZARD_LEVELS, PUBLIC_SOS_TYPES, REQUEST_TYPES, TIPS } from '../constants'
import { distanceKm, docsToList, formatDistance, getPosition, hasLoc, homeFor, timeAgo, withTimeout } from '../utils'
import Header from '../components/Header'
import MapView from '../components/MapView'
import EvidenceCapture from '../components/EvidenceCapture'
import Icon from '../components/Icon'
import AudioPlayer from '../components/AudioPlayer'
import AssessmentDetails from '../components/AssessmentDetails'
import { assess, fetchDischarge, fetchElevations, fetchRainForecast, fetchRainHistory, fetchTerrain } from '../floodData'

export default function PublicHome() {
  const { user, profile, logout } = useAuth()
  const online = useOnline()
  const { t } = useLang()

  const [hazard, setHazard] = useState(null)
  const [zones, setZones] = useState([])
  const [mine, setMine] = useState([])
  const [me, setMe] = useState(null)
  const [myElev, setMyElev] = useState(null)
  const [myAssessment, setMyAssessment] = useState(null)
  const [assessStatus, setAssessStatus] = useState('idle') // idle | loading | ready | error | offline
  const [locNote, setLocNote] = useState(t('ph_locFinding'))
  const [type, setType] = useState('trapped')
  const [partySize, setPartySize] = useState(1)
  const [groups, setGroups] = useState({ elderly: false, pregnant: false, children: false })
  const [audioNote, setAudioNote] = useState(null) // {data, seconds} | null
  const [photo, setPhoto] = useState(null) // data url | null
  const [phase, setPhase] = useState('before')
  const [tab, setTab] = useState('sos') // opens on SOS first — that's the time-critical part
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null) // {kind:'ok'|'error', text}

  useEffect(() => {
    const onErr = (label) => (err) => console.error(`${label} listener failed:`, err)
    const u1 = onSnapshot(doc(db, 'hazard', 'current'), (s) => setHazard(s.exists() ? s.data() : null), onErr('hazard'))
    const u2 = onSnapshot(collection(db, 'safeZones'), (s) => setZones(docsToList(s)), onErr('safeZones'))
    const u3 = onSnapshot(
      query(collection(db, 'requests'), where('createdBy', '==', user.uid)),
      (s) => setMine(docsToList(s)),
      onErr('requests')
    )
    return () => { u1(); u2(); u3() }
  }, [user.uid])

  useEffect(() => {
    getPosition()
      .then((p) => { setMe(p); setLocNote(t('ph_locFound')) })
      .catch(() => setLocNote(t('ph_locFailed')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ground level at the user's position, so safe places can be compared for height
  useEffect(() => {
    setMyElev(null)
    if (!me || !navigator.onLine) return
    let stop = false
    const tmr = setTimeout(() => {
      fetchElevations([me]).then((e) => { if (!stop && typeof e[0] === 'number') setMyElev(Math.round(e[0])) }).catch(() => {})
    }, 600)
    return () => { stop = true; clearTimeout(tmr) }
  }, [me])

  // The public status no longer just waits on the control room to look at it: it's computed
  // live, in the browser, from the same elevation/rain-history/river/forecast data the control
  // room's own FloodPanel uses — for wherever the viewer actually is, automatically. The control
  // room's manual setting is now an OVERRIDE on top of that, for when they know something the
  // data doesn't yet (a ground report of flooding the forecast hasn't caught up to, or a false
  // alarm) — not the only source, so nobody's status silently depends on someone remembering to
  // set it.
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

  // Honesty check, kept from before: the control room's override is for one specific point.
  // An override set for Mumbai should never silently apply to someone in Delhi — it only counts
  // as relevant when the viewer is actually near it.
  const NEARBY_KM = 50
  const distToHazard = me && hazard?.area?.lat != null && hazard?.area?.lng != null
    ? distanceKm(me, [hazard.area.lat, hazard.area.lng])
    : null
  const overrideApplies = !!hazard?.area && (distToHazard == null || distToHazard <= NEARBY_KM)
  const autoReady = assessStatus === 'ready' && !!myAssessment

  // Precedence: an applicable override always wins (that's the point of giving the control room
  // a manual toggle). Otherwise, the live per-location assessment. Never falls back to a flat
  // "Safe" just because neither is available yet — that would silently hide an unassessed risk
  // behind a reassuring colour, the exact problem this replaces.
  const level = overrideApplies
    ? (HAZARD_LEVELS[hazard.level] ? hazard.level : 'safe')
    : autoReady && HAZARD_LEVELS[myAssessment.level] ? myAssessment.level : null
  const lv = level ? HAZARD_LEVELS[level] : { label: t('ph_checking'), color: '#868e96', text: '' }
  const hazardAppliesToMe = overrideApplies // kept for anything below still referencing this name

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

  const myOpen = useMemo(() => mine.filter((r) => r.status !== 'resolved'), [mine])
  const myList = useMemo(
    () => [...mine].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)),
    [mine]
  )

  function toggleGroup(key) {
    setGroups((g) => ({ ...g, [key]: !g[key] }))
  }

  // One tap for someone who was at risk but is now fine — clears their own open requests
  // without needing a rescuer to act on them. Rescuers waste real time chasing situations
  // that already resolved themselves; this removes that lag entirely.
  async function markSafe() {
    if (myOpen.length === 0) return
    setMsg(null)
    setSending(true)
    try {
      await Promise.all(
        myOpen.map((r) =>
          updateDoc(doc(db, 'requests', r.id), {
            status: 'resolved',
            resolvedBy: 'self',
            resolvedAt: serverTimestamp(),
          })
        )
      )
      setMsg({ kind: 'ok', text: t('ph_markedSafe') })
    } catch (err) {
      console.error(err)
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setSending(false)
    }
  }

  async function sendSOS() {
    setMsg(null)
    if (!me) return setMsg({ kind: 'error', text: t('ph_setLocationFirst') })
    const request = {
      type,
      source: 'public',
      status: 'pending',
      lat: me[0],
      lng: me[1],
      partySize,
      groupElderly: groups.elderly,
      groupPregnant: groups.pregnant,
      groupChildren: groups.children,
      createdBy: user.uid,
      createdByEmail: user.email,
      createdAt: serverTimestamp(),
      ...(audioNote ? { audioNote: audioNote.data, audioSeconds: audioNote.seconds } : {}),
      ...(photo ? { photo } : {}),
    }
    setSending(true)
    try {
      if (!navigator.onLine) {
        // Firestore keeps the write on this phone and sends it when the connection returns
        addDoc(collection(db, 'requests'), request).catch((e) => console.error(e))
        setMsg({ kind: 'ok', text: t('ph_offlineSaved') })
      } else {
        await withTimeout(addDoc(collection(db, 'requests'), request), 10000, 'Sending took too long. Check your connection and try again.')
        setMsg({ kind: 'ok', text: t('ph_sosSent') })
      }
      setPartySize(1)
      setGroups({ elderly: false, pregnant: false, children: false })
      setAudioNote(null)
      setPhoto(null)
    } catch (err) {
      console.error(err)
      setMsg({ kind: 'error', text: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Header subtitle={t('ph_subtitle')}>
        {profile.role !== 'public' && <Link className="btn ghost sm" to={homeFor(profile)}>{t('ph_back')}</Link>}
        <button className="btn ghost sm" onClick={logout}>{t('signOut')}</button>
      </Header>

      {!online && (
        <div className="banner offline">
          {t('ph_offlineBanner')}
        </div>
      )}

      <main className="container">
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

        <div className="tabs ph-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'sos'} className={tab === 'sos' ? 'on' : ''} onClick={() => setTab('sos')}>
            {t('ph_tabSOS')}
          </button>
          <button role="tab" aria-selected={tab === 'safety'} className={tab === 'safety' ? 'on' : ''} onClick={() => setTab('safety')}>
            {t('ph_tabSafetyMap')}
          </button>
        </div>

        {tab === 'sos' && (
        <>
        <section className="card">
          <h2>{t('ph_sendSOSHeading')}</h2>
          <p>{t('ph_chooseWhatYouNeed')}</p>
          <div className="type-grid" role="radiogroup" aria-label={t('ph_chooseWhatYouNeed')}>
            {PUBLIC_SOS_TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                role="radio"
                aria-checked={type === ty}
                className={`type-tile ${type === ty ? 'on' : ''}`}
                onClick={() => setType(ty)}
              >
                <Icon type={ty} size={26} />
                <span>{REQUEST_TYPES[ty].label}</span>
              </button>
            ))}
          </div>

          <div className="sos-block">
            <p className="field-label">{t('ph_howManyPeople')}</p>
            <div className="stepper">
              <button type="button" className="stepper-btn" onClick={() => setPartySize((n) => Math.max(1, n - 1))} aria-label="Fewer people">−</button>
              <span className="stepper-value"><Icon type="people" size={18} />{partySize}</span>
              <button type="button" className="stepper-btn" onClick={() => setPartySize((n) => Math.min(20, n + 1))} aria-label="More people">+</button>
            </div>
          </div>

          <div className="sos-block">
            <p className="field-label">{t('ph_extraCare')}</p>
            <div className="care-row">
              <button
                type="button"
                className={`care-tile ${groups.elderly ? 'on' : ''}`}
                aria-pressed={groups.elderly}
                onClick={() => toggleGroup('elderly')}
              >
                <Icon type="elderly" size={22} />
                <span>{t('ph_elderly')}</span>
              </button>
              <button
                type="button"
                className={`care-tile ${groups.pregnant ? 'on' : ''}`}
                aria-pressed={groups.pregnant}
                onClick={() => toggleGroup('pregnant')}
              >
                <Icon type="pregnant" size={22} />
                <span>{t('ph_pregnant')}</span>
              </button>
              <button
                type="button"
                className={`care-tile ${groups.children ? 'on' : ''}`}
                aria-pressed={groups.children}
                onClick={() => toggleGroup('children')}
              >
                <Icon type="children" size={22} />
                <span>{t('ph_children')}</span>
              </button>
            </div>
          </div>

          <EvidenceCapture audio={audioNote} onAudioChange={setAudioNote} photo={photo} onPhotoChange={setPhoto} />

          <button className="btn danger lg" onClick={sendSOS} disabled={sending || myOpen.length >= 3}>
            {sending ? t('ph_sending') : t('ph_sendSOS')}
          </button>
          {myOpen.length > 0 && (
            <button className="btn success lg" onClick={markSafe} disabled={sending}>
              {t('ph_imSafe')}
            </button>
          )}
          <p className="fine">{locNote}</p>
          {myOpen.length >= 3 && <p className="fine">{t('ph_openRequestsWarning')}</p>}
          {msg && <div className={`notice ${msg.kind === 'error' ? 'error' : 'ok'}`}>{msg.text}</div>}
        </section>

        {myList.length > 0 && (
          <section className="card">
            <h2>{t('ph_yourRequests')}</h2>
            <ul className="plain">
              {myList.map((r) => (
                <li key={r.id}>
                  <span>
                    <strong>{REQUEST_TYPES[r.type]?.label || r.type}</strong>
                    <small>{timeAgo(r.createdAt)}{r.acceptedByName ? `, ${t('ph_acceptedBy')} ${r.acceptedByName}` : ''}</small>
                    {r.partySize > 0 && (
                      <small className="party-info">
                        <Icon type="people" size={14} /> {r.partySize} {r.partySize === 1 ? t('ph_person') : t('ph_peoplePlural')}
                        {r.groupElderly && <span className="party-tag">{t('ph_elderly')}</span>}
                        {r.groupPregnant && <span className="party-tag">{t('ph_pregnant')}</span>}
                        {r.groupChildren && <span className="party-tag">{t('ph_children')}</span>}
                      </small>
                    )}
                  </span>
                  <span className={`pill ${r.status}`}>{r.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        </>
        )}

        {tab === 'safety' && (
        <>
        <section className="card">
          <h2>{t('ph_safePlaces')}</h2>
          <MapView
            safeZones={zones}
            requests={myOpen}
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
        </>
        )}
      </main>
    </>
  )
}

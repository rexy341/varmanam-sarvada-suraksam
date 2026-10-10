import { useRef } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { homeFor } from '../utils'
import { LANGS, useLang } from '../i18n'
import Splash from '../components/Splash'
import Logo from '../components/Logo'
import HazardIcon from '../components/HazardIcon'

// Order matters: flood renders first (it's the only live one) and its colour class
// anchors the palette the others are varied from. "live: true" is the only thing that
// makes a band clickable — add more hazards here later just by flipping the flag.
const HAZARDS = [
  { id: 'flood', live: true },
  { id: 'cyclone', live: false },
  { id: 'landslide', live: false },
  { id: 'smog', live: false },
  { id: 'collapse', live: false },
  { id: 'quake', live: false },
]

export default function Landing() {
  const { user, profile, loading } = useAuth()
  const { lang, setLang, t } = useLang()
  const nav = useNavigate()
  const taps = useRef([])

  // Hidden control-room entry: tap the logo mark three times within two seconds
  function secretTap() {
    const now = Date.now()
    taps.current = [...taps.current.filter((tt) => now - tt < 2000), now]
    if (taps.current.length >= 3) {
      taps.current = []
      nav('/auth?as=admin')
    }
  }

  if (loading) return <Splash />
  if (user && profile) return <Navigate to={homeFor(profile)} replace />
  if (user && !profile) return <Navigate to="/auth" replace />

  return (
    <div className="landing landing-bands">
      <div className="hazard-bands" role="list">
        {HAZARDS.map((h) =>
          h.live ? (
            <Link
              key={h.id}
              to="/auth?as=public"
              role="listitem"
              className={`hazard-band hazard-band--${h.id} hazard-band-live`}
            >
              <span className="hazard-band-inner">
                <span className="hazard-band-icon-chip">
                  <HazardIcon type={h.id} size={28} className="hazard-band-icon" />
                </span>
                <span className="hazard-band-label">{t(`hazard_${h.id}`)}</span>
                <span className="hazard-band-sub">{t('hazardSelectFlood')}</span>
                <span className="hazard-band-chevron" aria-hidden="true">⌃</span>
              </span>
            </Link>
          ) : (
            <div key={h.id} role="listitem" className={`hazard-band hazard-band--${h.id}`} aria-disabled="true">
              <span className="hazard-band-inner">
                <span className="hazard-band-soon-pill">{t('hazardComingSoon')}</span>
                <span className="hazard-band-icon-chip">
                  <HazardIcon type={h.id} size={24} className="hazard-band-icon" />
                </span>
                <span className="hazard-band-label">{t(`hazard_${h.id}`)}</span>
              </span>
            </div>
          )
        )}
      </div>

      <div className="landing-overlay">
        <label className="lang-switch lang-switch-floating" aria-label="Language">
          <span aria-hidden="true">🌐</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <div className="landing-card">
          <button className="brand-mark-btn secret" aria-label="Varman" onClick={secretTap}>
            <Logo size={52} />
          </button>
          <h1>{t('appName')}</h1>
          <p className="lead">{t('tagline')}</p>
          <p className="fine">{t('verifyNote')}</p>
          <Link className="rescuer-link" to="/auth?as=rescuer">{t('ctaRescuer')}</Link>
          <Link className="rescuer-link" to="/map">{t('ph_viewMapNoLogin')}</Link>
        </div>
      </div>
    </div>
  )
}

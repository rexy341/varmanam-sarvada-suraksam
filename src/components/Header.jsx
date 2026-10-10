import { Link } from 'react-router-dom'
import Logo from './Logo'
import { LANGS, useLang } from '../i18n'

export default function Header({ subtitle, children }) {
  const { lang, setLang } = useLang()
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <Logo size={28} />
        <span>
          <strong>Varman</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
      </Link>
      <nav className="topbar-actions">
        <label className="lang-switch" aria-label="Language">
          <span aria-hidden="true">🌐</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        {children}
      </nav>
    </header>
  )
}

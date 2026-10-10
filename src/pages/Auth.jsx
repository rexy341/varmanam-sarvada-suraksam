import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../AuthContext'
import { homeFor } from '../utils'
import { useLang } from '../i18n'
import Header from '../components/Header'
import Rain from '../components/Rain'

function friendlyError(err) {
  switch (err.code) {
    case 'auth/email-already-in-use': return 'That email already has an account. Switch to Log in.'
    case 'auth/weak-password': return 'Use a password with at least 6 characters.'
    case 'auth/invalid-email': return 'That email address does not look right.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Email or password is wrong.'
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is off. Firebase console, Authentication, Sign-in method, enable Email/Password.'
    case 'auth/network-request-failed': return 'Could not reach Firebase. Check your internet connection.'
    default: return err.message || 'Something went wrong.'
  }
}

// Same rainy hero used to sit behind the whole landing page; now it sits behind the
// login/signup card instead, so the card is the first interactive thing you reach.
function AuthShell({ children }) {
  return (
    <div className="auth-shell">
      <Rain />
      <Header />
      <main className="container narrow auth-shell-main">{children}</main>
    </div>
  )
}

export default function Auth() {
  const [params] = useSearchParams()
  const asParam = params.get('as')
  const intent = asParam === 'rescuer' ? 'rescuer' : asParam === 'admin' ? 'admin' : 'public'
  const isAdminLogin = intent === 'admin'
  const { user, profile, loading, slow, profileError, createProfile, logout } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()

  const [mode, setMode] = useState(isAdminLogin ? 'login' : 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // On the control-room login, only an admin profile moves on; anyone else gets a message below
    if (user && profile && !(isAdminLogin && profile.role !== 'admin')) nav(homeFor(profile), { replace: true })
  }, [user, profile, nav, isAdminLogin])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await createProfile(intent === 'rescuer' ? 'rescuer' : 'public', cred.user)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
      // The profile listener in AuthContext picks up the new document and the effect above redirects.
    } catch (err) {
      console.error(err)
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function finishSetup(role) {
    setError('')
    setBusy(true)
    try {
      await createProfile(role)
    } catch (err) {
      console.error(err)
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  // Signed in, still waiting for Firestore to return the profile. Without this the form just sits
  // there looking unchanged, as if the login button did nothing.
  if (user && !profile && loading) {
    return (
      <AuthShell>
          <section className="card center-text">
            <div className="spinner" />
            <h2>Signed in</h2>
            <p>Loading your account…</p>
            {slow && (
              <div className="notice">
                <p>
                  Your login worked, but Firestore is not answering, so the app cannot load your account.
                  This is a database connection problem, not a wrong password.
                </p>
                <div className="row">
                  <Link className="btn primary" to="/diag">Run diagnostics</Link>
                  <button className="btn ghost" onClick={logout}>{t('signOut')}</button>
                </div>
              </div>
            )}
          </section>
        </AuthShell>
    )
  }

  // Control-room login with an account that is not an admin (or whose profile could not be read)
  if (isAdminLogin && !loading && user && (!profile || profile.role !== 'admin')) {
    return (
      <AuthShell>
          <section className="card">
            <h2>{profile ? 'This is not a control-room account' : 'Could not load this account'}</h2>
            {profile ? (
              <p>{user.email} is not set up as an admin (its role is "{profile.role || 'not set'}"). Sign out and use the admin account, or set role to admin in Firestore.</p>
            ) : (
              <>
                <p>
                  {user.email} logged in, but no profile could be read from Firestore. Either the account has no profile yet, or Firestore could not be reached.
                </p>
                {profileError && <div className="notice error">{profileError}</div>}
              </>
            )}
            <div className="stack">
              {!profile && <Link className="btn outline" to="/diag">Run diagnostics</Link>}
              <button className="btn primary" onClick={logout}>{t('signOut')}</button>
            </div>
          </section>
        </AuthShell>
    )
  }

  // Signed in, but the profile document is missing (older account, or the first save failed)
  if (!loading && user && !profile) {
    return (
      <AuthShell>
          <section className="card">
            <h2>Finish setting up {user.email}</h2>
            <p>Your login works, but your profile was never saved. Choose how you will use the app.</p>
            {error && <div className="notice error">{error}</div>}
            <div className="stack">
              <button className="btn primary" disabled={busy} onClick={() => finishSetup('public')}>
                {busy ? t('auth_pleaseWait') : 'Continue as public user'}
              </button>
              <button className="btn outline" disabled={busy} onClick={() => finishSetup('rescuer')}>
                Continue as rescuer or relief unit
              </button>
              <button className="btn ghost" onClick={logout}>{t('signOut')}</button>
            </div>
          </section>
        </AuthShell>
    )
  }

  return (
    <AuthShell>
        <section className="card">
          <h2>
            {isAdminLogin ? t('auth_loginHeading') : mode === 'signup' ? t('auth_createHeading') : t('auth_loginHeading')}
            {intent === 'rescuer' ? t('auth_asRescuer') : ''}
          </h2>
          <form onSubmit={submit} className="stack">
            <label>
              {t('auth_email')}
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              {t('auth_password')}
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <div className="notice error">{error}</div>}
            <button className="btn primary" disabled={busy}>
              {busy ? t('auth_pleaseWait') : mode === 'signup' ? t('auth_createAccount') : t('auth_login')}
            </button>
          </form>
          {!isAdminLogin && (
          <p className="switch">
            {mode === 'signup' ? t('auth_alreadyHaveAccount') : t('auth_newHere')}{' '}
            <button className="linklike" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError('') }}>
              {mode === 'signup' ? t('auth_login') : t('auth_createAnAccount')}
            </button>
          </p>
          )}
          <p className="switch"><Link to="/">{t('auth_back')}</Link></p>
        </section>
      </AuthShell>
  )
}

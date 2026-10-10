import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import Header from '../components/Header'

// When the control room approves the account, the guard in App.jsx moves this screen to the
// dashboard on its own. No re-login needed.
export default function Pending() {
  const { profile, logout } = useAuth()
  const rejected = profile.verificationStatus === 'rejected'

  return (
    <>
      <Header subtitle="Rescuer verification">
        <button className="btn ghost sm" onClick={logout}>Sign out</button>
      </Header>
      <main className="container narrow">
        <section className="card">
          {rejected ? (
            <>
              <h2>Verification was not approved</h2>
              <p>The control room could not confirm your details. Check the ID number and photo link, then submit again.</p>
              <div className="stack">
                <Link className="btn primary" to="/verify">Update details</Link>
                <Link className="btn outline" to="/public">Open public safety info</Link>
              </div>
            </>
          ) : (
            <>
              <div className="spinner" />
              <h2>Waiting for the control room</h2>
              <p>
                Your details for <strong>{profile.unitName || profile.email}</strong> are with the verifier.
                This page opens the dashboard by itself as soon as you are approved.
              </p>
              <div className="stack">
                <Link className="btn outline" to="/public">Open public safety info meanwhile</Link>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  )
}

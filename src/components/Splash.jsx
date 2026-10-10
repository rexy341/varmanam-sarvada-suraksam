import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function Splash() {
  const { slow, logout } = useAuth()
  return (
    <div className="center-screen">
      <div className="spinner" />
      <p>Loading</p>
      {slow && (
        <div className="notice">
          <p>This is taking longer than usual. Check your internet connection and that Firestore is set up
          (Firebase console, Firestore Database, a database named (default) in Native mode, rules published).</p>
          <div className="row">
            <Link className="btn primary" to="/diag">Run diagnostics</Link>
            <button className="btn ghost" onClick={logout}>Sign out and retry</button>
          </div>
        </div>
      )}
    </div>
  )
}

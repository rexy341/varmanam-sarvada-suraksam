import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { homeFor } from './utils'
import Splash from './components/Splash'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Verify from './pages/Verify'
import Pending from './pages/Pending'
import PublicHome from './pages/PublicHome'
import PublicMap from './pages/PublicMap'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import Diagnose from './pages/Diagnose'

function Guard({ allow, children }) {
  const { user, profile, loading, profileError } = useAuth()
  if (loading) return <Splash />
  if (!user) return <Navigate to="/" replace />
  if (profileError) {
    return (
      <div className="center-screen">
        <div className="notice error">
          <p><strong>Could not read your profile.</strong></p>
          <p>{profileError}</p>
          <p>If this says "permission-denied", publish the Firestore rules from the README.</p>
        </div>
      </div>
    )
  }
  if (!profile) return <Navigate to="/auth" replace />
  if (!allow(profile)) return <Navigate to={homeFor(profile)} replace />
  return children
}

const isVerifiedRescuer = (p) => p.role === 'rescuer' && p.verificationStatus === 'verified'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/diag" element={<Diagnose />} />
      {/* No login required: hazard level, safe places and safety tips for whoever opens it. */}
      <Route path="/map" element={<PublicMap />} />
      <Route
        path="/verify"
        element={
          <Guard allow={(p) => p.role === 'rescuer' && p.verificationStatus !== 'verified'}>
            <Verify />
          </Guard>
        }
      />
      <Route
        path="/pending"
        element={
          <Guard allow={(p) => p.role === 'rescuer' && ['pending', 'rejected'].includes(p.verificationStatus)}>
            <Pending />
          </Guard>
        }
      />
      <Route path="/public" element={<Guard allow={() => true}><PublicHome /></Guard>} />
      <Route
        path="/dashboard"
        element={<Guard allow={(p) => p.role === 'admin' || isVerifiedRescuer(p)}><Dashboard /></Guard>}
      />
      <Route path="/admin" element={<Guard allow={(p) => p.role === 'admin'}><Admin /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

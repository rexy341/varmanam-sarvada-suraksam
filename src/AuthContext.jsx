import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { withTimeout } from './utils'

export const PROFILE_TIMEOUT_MSG =
  'Your account was created, but saving your profile to Firestore took more than 10 seconds. ' +
  'Usual causes: the Firestore rules are not published, the project has no (default) database in Native mode, ' +
  'or an ad blocker / Brave Shields is blocking Firestore. Open the browser Console tab to see the exact error.'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [slow, setSlow] = useState(false)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    let unsubProfile = () => {}
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      unsubProfile()
      setUser(u)
      setProfileError('')
      if (!u) {
        setProfile(null)
        setLoading(false)
        return
      }
      setLoading(true)
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null)
          setLoading(false)
        },
        (err) => {
          console.error('Profile listener failed:', err)
          setProfileError(err.message)
          setLoading(false)
        }
      )
    })
    return () => {
      unsubAuth()
      unsubProfile()
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const t = setTimeout(() => setSlow(true), 12000)
    return () => clearTimeout(t)
  }, [loading])

  const createProfile = useCallback(async (role, u = auth.currentUser) => {
    if (!u) throw new Error('You are not signed in.')
    await withTimeout(
      setDoc(doc(db, 'users', u.uid), {
        email: u.email,
        role,
        verificationStatus: 'none',
        createdAt: serverTimestamp(),
      }),
      10000,
      PROFILE_TIMEOUT_MSG
    )
  }, [])

  const logout = useCallback(() => signOut(auth), [])

  return (
    <Ctx.Provider value={{ user, profile, loading, slow, profileError, createProfile, logout }}>
      {children}
    </Ctx.Provider>
  )
}

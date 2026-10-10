import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: 'AIzaSyCB5peTlldLBJfZ3a42jjxPAIy32O37fK4',
  authDomain: 'dhriti-e7949.firebaseapp.com',
  projectId: 'dhriti-e7949',
  storageBucket: 'dhriti-e7949.firebasestorage.app',
  messagingSenderId: '808907983984',
  appId: '1:808907983984:web:ee875ba618a6611d6c78b5',
}

// The Firestore database this app talks to. Must match the Database ID shown at the top of
// Firebase console > Firestore Database. The default one is called (default).
export const DATABASE_ID = 'dhriti'

// Set to true only if /diag says the normal connection is blocked but long polling gets through.
export const FORCE_LONG_POLLING = false

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Offline cache keeps the last-synced hazard status and safe places available without network.
// Long-polling auto-detect helps on networks/antivirus that break Firestore's default streaming.
function makeDb() {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        ...(FORCE_LONG_POLLING ? { experimentalForceLongPolling: true } : { experimentalAutoDetectLongPolling: true }),
      },
      DATABASE_ID
    )
  } catch {
    // Already initialised (happens with hot reload)
    return getFirestore(app, DATABASE_ID)
  }
}

export const db = makeDb()
export default app

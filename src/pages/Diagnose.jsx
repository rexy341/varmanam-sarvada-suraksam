import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteApp, initializeApp } from 'firebase/app'
import { doc, getDocFromServer, initializeFirestore, terminate } from 'firebase/firestore'
import app, { auth, db, DATABASE_ID, firebaseConfig } from '../firebase'
import Header from '../components/Header'

/*
  /diag  tells you exactly why Firestore is not answering.
  It tries the same read four ways, so the pattern of results points at the cause:
    1. plain HTTPS to firestore.googleapis.com   (is the network reachable, does the database exist)
    2. Firebase SDK, normal connection
    3. Firebase SDK, forced long polling
    4. Firebase SDK, this app's own connection, reading your profile (rules)
*/

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))

async function probeRest(dbId, user) {
  const project = app.options.projectId
  const path = user ? `users/${user.uid}` : 'hazard/current'
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/${dbId}/documents/${path}`
  try {
    const headers = user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}
    const res = await fetch(url, { headers })
    const body = await res.json().catch(() => ({}))
    const msg = body?.error?.message || ''
    if (res.status === 200) return { kind: 'ok', text: 'Reached Firestore. The database exists and the read worked.' }
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return { kind: 'apidisabled', text: msg }
    if (res.status === 404 && /database/i.test(msg) && /not exist|not found/i.test(msg)) return { kind: 'nodb', text: msg }
    if (res.status === 404) return { kind: 'ok', text: 'Reached Firestore. The database exists; that document is just not there yet.' }
    if (res.status === 401 || res.status === 403) {
      return user
        ? { kind: 'rules', text: `Reached Firestore but it refused the read (${res.status}). ${msg}` }
        : { kind: 'ok', text: 'Reached Firestore. It refused an anonymous read, which is expected.' }
    }
    return { kind: 'other', text: `HTTP ${res.status}. ${msg}` }
  } catch (err) {
    return { kind: 'unreachable', text: `The request never got an answer (${err.message}).` }
  }
}

async function probeSdk(settings, dbId) {
  const a = initializeApp(firebaseConfig, `diag-${Math.random().toString(36).slice(2)}`)
  const fs = initializeFirestore(a, settings, dbId)
  const t0 = performance.now()
  try {
    await Promise.race([getDocFromServer(doc(fs, 'hazard', 'current')), timeout(15000)])
    return { ok: true, text: `Connected in ${Math.round(performance.now() - t0)} ms.` }
  } catch (e) {
    // This probe is not signed in, so "permission-denied" still proves the connection works
    if (e.code === 'permission-denied') return { ok: true, text: 'Connected. The server answered "permission denied", which is fine here because this test is not signed in.' }
    return { ok: false, text: e.code === 'timeout' ? 'No answer after 15 seconds.' : `${e.code || 'error'}: ${e.message}` }
  } finally {
    terminate(fs).catch(() => {})
    deleteApp(a).catch(() => {})
  }
}

async function probeMain(user) {
  try {
    const snap = await Promise.race([getDocFromServer(doc(db, 'users', user.uid)), timeout(15000)])
    return snap.exists()
      ? { ok: true, text: 'Read your profile through the app connection.' }
      : { ok: true, text: 'Connected, but your profile document does not exist yet. Open the app and use "Finish setting up".' }
  } catch (e) {
    if (e.code === 'permission-denied') return { ok: false, text: 'The rules refused the read. Publish the rules from firestore.rules.' }
    return { ok: false, text: e.code === 'timeout' ? 'No answer after 15 seconds.' : `${e.code || 'error'}: ${e.message}` }
  }
}

function verdict(r, dbId) {
  const project = app.options.projectId
  if (r.rest.kind === 'unreachable')
    return 'This browser cannot reach firestore.googleapis.com. Try a phone hotspot, turn off any VPN or proxy, pause antivirus web protection, and try an incognito window with extensions off (ad blockers and Brave Shields block Firestore).'
  if (r.rest.kind === 'apidisabled')
    return `The Cloud Firestore API is switched off for project ${project}. Open the link in the message above, click Enable, wait a minute and retry.`
  if (r.rest.kind === 'nodb')
    return `Project ${project} has no database with the ID "${dbId}". In Firebase console, Firestore Database, read the Database ID at the top. If it is not "(default)", type it in the box above to confirm it works, then put it in DATABASE_ID in src/firebase.js. Or create a database whose ID is (default).`
  if (r.rest.kind === 'rules')
    return 'The database is reachable but the rules refuse the read. Firebase console, Firestore Database, Rules: paste firestore.rules from the project and click Publish.'
  if (!r.sdk.ok && r.sdkLong.ok)
    return 'The normal Firestore connection is blocked but long polling gets through. In src/firebase.js set FORCE_LONG_POLLING to true, save, and restart npm run dev.'
  if (!r.sdk.ok && !r.sdkLong.ok)
    return 'Plain HTTPS works but both Firestore SDK connections fail. That points at an extension, antivirus web shield or proxy interfering with Google streaming connections. Try incognito with extensions off, or another network.'
  if (r.main && !r.main.ok) return 'Everything reaches Firestore, but the app read failed. See the last line above.'
  return 'Everything is reachable. If the app still loads forever, open the browser Console tab (F12) and send me the red error.'
}

export default function Diagnose() {
  const [dbId, setDbId] = useState(DATABASE_ID)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)

  async function run() {
    setBusy(true)
    setRes(null)
    const user = auth.currentUser
    const [rest, sdk, sdkLong, main] = await Promise.all([
      probeRest(dbId, user),
      probeSdk({}, dbId),
      probeSdk({ experimentalForceLongPolling: true }, dbId),
      user ? probeMain(user) : Promise.resolve(null),
    ])
    setRes({ rest, sdk, sdkLong, main, user })
    setBusy(false)
  }

  const Row = ({ label, ok, text }) => (
    <li>
      <span>
        <strong>{label}</strong>
        <small>{text}</small>
      </span>
      <span className={`pill ${ok === true ? 'resolved' : ok === false ? 'pending' : 'muted'}`}>{ok === true ? 'ok' : ok === false ? 'fail' : 'skipped'}</span>
    </li>
  )

  return (
    <>
      <Header subtitle="Diagnostics" />
      <main className="container narrow">
        <section className="card">
          <h2>Why is Firestore not answering?</h2>
          <p>Runs the same read four different ways and tells you which part is broken. Takes up to 15 seconds.</p>
          <label>
            Database ID
            <input value={dbId} onChange={(e) => setDbId(e.target.value.trim())} />
            <small>Project {app.options.projectId}. Leave as (default) unless your Firebase console shows another ID.</small>
          </label>
          <div className="stack" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Testing…' : 'Run checks'}</button>
          </div>

          {res && (
            <>
              <ul className="plain">
                <Row label="Browser online" ok={navigator.onLine} text={navigator.onLine ? 'Yes' : 'The browser reports no connection.'} />
                <Row label="Signed in" ok={res.user ? true : null} text={res.user ? res.user.email : 'Not signed in. Sign in first for the rules check.'} />
                <Row label="1. Plain HTTPS to Firestore" ok={res.rest.kind === 'ok'} text={res.rest.text} />
                <Row label="2. Firebase SDK, normal connection" ok={res.sdk.ok} text={res.sdk.text} />
                <Row label="3. Firebase SDK, long polling" ok={res.sdkLong.ok} text={res.sdkLong.text} />
                <Row label="4. Reading your profile in the app" ok={res.main ? res.main.ok : null} text={res.main ? res.main.text : 'Skipped, not signed in.'} />
              </ul>
              <div className="notice"><strong>What to do:</strong> {verdict(res, dbId)}</div>
            </>
          )}
          <p className="switch"><Link to="/">Back to the app</Link></p>
        </section>
      </main>
    </>
  )
}

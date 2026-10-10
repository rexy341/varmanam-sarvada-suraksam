# Varman app (React + Firebase + Leaflet PWA)

## Run
    npm install
    npm run dev          # http://localhost:5173

The Firebase config for project dhriti-e7949 is already in src/firebase.js.

## One-time Firebase setup
1. Authentication > Sign-in method: Email/Password enabled.
2. Firestore Database: a database named (default), Native mode.
3. Firestore Database > Rules: paste the contents of firestore.rules and click Publish.
   (If signup hangs or the console says permission-denied, this is the cause.)

## Make yourself the admin (control room)
1. Sign up normally in the app (any option).
2. Firebase console > Firestore > users > your document.
3. Edit the field role: change it to admin.
4. Reload the app. You land on /admin. Open "Command dashboard" for the full map.

## If a screen loads forever
Open http://localhost:5173/diag and click Run checks. It tests the connection to Firestore four ways and
says what to fix (network blocked, wrong Database ID, Firestore API off, rules, or long polling needed).
The loading screen also links to it after 12 seconds.

## Lightning in the rain background
src/components/Rain.jsx now also renders a few jagged bolts near the left/right edges plus a
faint sky flash, each looping on its own 15-19s cycle so they don't strike in an obvious
repeating pattern. Both sit behind the card in z-order, and on phones (max-width: 640px) the
bolts shift further out (some partly off-screen) so a strike is never behind the card itself,
which spans nearly the full width there. Same reduced-motion rule as the rain hides all of it.

## SOS flow visual redesign
The category picker, party-size counter and elderly/pregnant/children toggles used plain browser-
default controls and emoji, which read as dated. They're now one icon-based system:
- src/components/Icon.jsx — original line icons (same style as HazardIcon.jsx: single stroke,
  no gradients) for request categories, party composition, and the mic/camera evidence controls.
- src/components/AudioPlayer.jsx — a small custom play/seek bar, used everywhere a voice note is
  played back, replacing the native <audio controls> (which looks different, and dated, in every
  browser).
- Category picker is now a 2-column icon-tile grid (.type-grid/.type-tile); party size is one
  fused stepper capsule (.stepper) instead of three separate boxes; elderly/pregnant/children are
  icon tiles one tier down in visual weight (.care-row/.care-tile, blue accent, not orange) so
  they read as supplementary to the category choice, not equal to it.
The same icon set and audio player are reused on the rescuer dashboard's request card, so a
request looks like the same system end to end.

## Evidence: voice note and photo on an SOS
On the SOS tab, the person can optionally record a short voice note and/or take a photo before
sending, src/components/EvidenceCapture.jsx. Both are manual and only run while the tab is open and
the phone is awake — no website can record in the background or with the screen locked; that's an
OS permission boundary on every phone, not something this works around. If you want that, it needs a
real native app (and on iPhone, isn't possible for a third-party app at all).

Limits, and why: the voice note is capped at 60 seconds and recorded at a low bitrate; the photo is
resized to 900px and compressed. Both are checked after capture (not just requested, since some
browsers ignore the requested bitrate) and rejected with a message if still too big. This keeps both
small enough to store as plain fields on the Firestore request document, so there's no Firebase
Storage and nothing to pay for. A rescuer sees the same voice note and photo, playable, on the request
card in the dashboard. Not wired into the Admin escalation tab yet — only the main dashboard list.

## Public page is two tabs
src/pages/PublicHome.jsx now opens on an "SOS" tab (category, party size, elderly/pregnant/children,
Send SOS, and the status of requests already sent) and a "Safety & map" tab (safe places map and
safety tips). The flood status banner stays visible above both tabs since it's the one thing that
should never be a tap away. Default tab on open is SOS — change the `useState('sos')` line in
PublicHome.jsx to 'safety' if you'd rather open there instead.

## App icons (Varman logo everywhere)
The old ring-and-dot placeholder icons are replaced by the real Varman mark (the same artwork as
src/components/Logo.jsx: cupped hands, wave, Om) on the brand navy, in public/:
- favicon.svg, favicon.ico (16/32/48), favicon-32.png — browser tab, bookmarks, taskbar/desktop shortcut
- apple-touch-icon.png (180) — iPhone/iPad "Add to Home Screen"
- icon-192.png, icon-512.png — Android and desktop (Chrome/Edge) PWA install icons
- icon-maskable-512.png — Android adaptive icon; the mark sits inside the safe zone so a circle or
  squircle mask never clips it
Referenced from index.html and the manifest in vite.config.js. The Om is drawn as a fixed vector
path (taken from a bold Devanagari font) instead of font text, so the icon looks identical on
every device — Logo.jsx itself still uses live text, which is fine inside the app.
If the logo artwork ever changes, these files need regenerating; the in-app logo updates on its own
but the icon files do not.
Already-installed copies keep the old icon until reinstalled: remove the app from the home screen
or uninstall the PWA, then add/install again. For the browser tab, hard-refresh (Ctrl+Shift+R).

## Public flood status is now automatic, control room is an override
PublicHome.jsx no longer only shows whatever the control room last set. The moment a public
user's location is known, the browser runs the same elevation/rain-history/river/forecast check
FloodPanel uses (src/floodData.js), automatically, for wherever that person actually is —
labelled "Based on live rain, river and elevation data for your location." No one has to
remember to look at it.

The control room's setting (hazard/current in Firestore) is now an override on top of that: if
it's for a point within 50 km of the viewer, it wins outright — level, message and all — for
exactly the case you'd want it for (ground reports the data hasn't caught up to yet, or a false
alarm to stand down). If it's for somewhere else, it's ignored for the main status and shown only
as a small supplementary line ("Nearest assessed point: X, NN km away — level"), so it's never
silently presented as if it were about the viewer.

Nothing here ever falls back to a plain "Safe" just because no data is available yet — the
loading/offline/error states show a neutral grey "Checking…" or the specific reason instead, so
an unassessed area is never dressed up as a safe one. There's a "Recheck" link once the first
check finishes or fails, since these calls aren't repeated automatically.

## Mobile landing card was doubled up
On phones, .landing-overlay (the floating card wrapper) and .landing-card (the content's own
card, nested inside it) were both rendering full card chrome — two backgrounds, two sets of
padding, two shadows stacked — which is what made the Varman card look oversized on a phone.
Fixed in the max-width:640px block in styles.css: .landing-overlay .landing-card is now stripped
back to a plain pass-through there, so only the outer card shows. Logo, heading and body text
were also sized back down to fit the card comfortably. If this regresses again after another
edit, check for exactly this: two nested elements each carrying their own background/padding/
shadow is the thing to look for.

## Dependency note (@vitejs/plugin-react bumped to 6.x)
package.json had drifted to vite ^8.3.1 with @vitejs/plugin-react still pinned at ^4.3.1 — that
combination doesn't install (4.3.1 resolves to a version that only supports vite up to 7).
@vitejs/plugin-react is now ^6.1.1, which supports vite 8. If npm install ever fails again with an
ERESOLVE peer-dependency error naming vite and @vitejs/plugin-react, that's almost always this same
kind of mismatch — check what version of @vitejs/plugin-react actually supports the installed vite
major version and bump it to match.

## Deploy to Firebase Hosting
Puts the app on a real https:// link anyone can open on a phone and install (Add to Home Screen).
firebase.json and .firebaserc are already set up for project dhriti-e7949. One-time setup:

    npm install -g firebase-tools      # or use npx firebase-tools for every command below, no install
    firebase login                     # opens a browser, sign in with the Google account that owns dhriti-e7949

Enable Hosting once (only needed the first time this project uses Hosting):
    Firebase console > Build > Hosting > Get started > follow the prompts (you can skip the CLI steps
    it shows you, since firebase.json is already in this project).

Every time you want to publish the current code:

    npm run build
    firebase deploy --only hosting

That prints a Hosting URL, something like https://dhriti-e7949.web.app — open it on a phone's browser
and use Add to Home Screen (Android Chrome: menu > Add to Home Screen; iPhone Safari: Share > Add to
Home Screen) to install it like a real app, no app store needed.

To publish again after any change: npm run build, then firebase deploy --only hosting, every time.
The URL stays the same, so nobody needs to reinstall — refreshing (or reopening) the installed app
picks up the new version within a few seconds via the service worker.

If firebase deploy asks "Which Firebase project do you want to associate?", pick dhriti-e7949 (or
run firebase use dhriti-e7949 first) — .firebaserc already defaults to it, so this normally does not
come up. If it errors that Hosting isn't set up, do the console step above first.

## Landing page: hazard bands
The first screen is a row of full-height, colour-coded bands (Flood, Cyclone, Landslide, Air Quality,
Drought, Earthquake), src/pages/Landing.jsx. Only Flood is live and opens the login/signup screen
(/auth?as=public); the others are inert placeholders for hazards this build doesn't cover yet. To add
another live hazard later, set its `live: true` in the HAZARDS array in Landing.jsx and point it at the
right /auth route. The falling-rain background now lives on the login/signup screen instead
(src/components/Rain.jsx, used by AuthShell in src/pages/Auth.jsx).

## Hidden control-room login
On the first screen (logged out), tap the round logo above "Varman" three times within two seconds.
It opens a login-only page for admins. A non-admin account that logs in there is told it is not a
control-room account. This only hides the door: what actually protects /admin is the role check, and
you should still tighten the Firestore rules before real use.

## Where do I approve rescuers?
Sign in as the admin account (see above). You land on /admin. The Verification tab lists every rescuer
who submitted details. Open the ID photo link, then Approve or Reject. The rescuer's waiting page opens
the dashboard by itself. Tip: use a second browser or an incognito window for the rescuer so you stay
signed in as admin in the first one.

## Flood status with elevation and flood history
Admin > Flood status. Search a place (or tap the map), optionally type a local flood record you can source,
then Analyse. The app pulls, live and free, from Open-Meteo:
- elevation of the point and the land around it (Copernicus DEM, 90 m), and the nearest higher ground
- past heavy rain, 30 years of ERA5 daily rain counted on the IMD scale (heavy 64.5, very heavy 115.6, extremely heavy 204.5 mm)
- river flow history since 1984 (GloFAS) and a 7 day river and rain forecast
It suggests Safe / Watch / Warning / Danger with the reasons listed, and one click applies it to every
public screen along with the place facts. Low ground and a history of frequent heavy rain raise the level,
but only when heavy rain or high river flow is actually forecast. Rules are in src/floodData.js (assess).
Safe places also store their own ground level, and the public screen shows whether each is higher than you.
This is advisory. Rain history is modelled and understates local extremes; confirm with CWC and IMD.
Open-Meteo's free tier is for non-commercial use and needs the attribution the app already shows.

## Demo flow
1. Admin > Flood status > Analyse a place and apply the level (or set one by hand). Public screens update live.
2. Second browser (or phone): sign up as rescuer, submit details with an image link.
3. Admin > Verification > Approve. The rescuer's waiting page opens the dashboard by itself.
4. Public account: Send SOS. It appears on the rescuer map and list at once.
5. Rescuer dashboard > Virtual field device > Broadcast (stands in for a LoRa device).
6. Rescuer: Accept, then Mark resolved. The public user sees each status change.
7. Admin > Escalations shows requests nobody accepted after the chosen number of minutes.

## Collections
users, requests, safeZones (with elevation), hazard/current (level, area, assessment)

## Before any real use
The rules in firestore.rules let any signed-in user read and write everything. That is fine for a demo
and not safe for real use: restrict role and verificationStatus edits to admins, and requests/safeZones
writes to verified rescuers.

## Installable app (PWA)
The service worker only exists in a production build:
    npm run build
    npm run preview

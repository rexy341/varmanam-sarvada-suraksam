// Falling-rain background, pure CSS animation, no image assets.
// Originally lived inline in Landing; factored out so Auth can reuse the same effect
// now that the stormy hero sits behind the login/signup card instead.
//
// Lightning: kept to the outer edges (positions below sit outside the centred card's
// column on anything wider than a phone, and a media query pushes them further out /
// partly off-screen on narrow phones). No full-screen flash — the light stays local to
// each bolt (the glow filter plus a couple of spark points along it), which reads as
// lightning without the whole page flashing bright, which was distracting.
// Each bolt cycles independently but staggered so a strike happens roughly every ~2s
// overall (see the matching keyframe timing in styles.css) — the original 15-19s gap
// made it easy to miss a strike entirely, especially during a quick login.
const BOLTS = [
  { left: '6%', duration: '8s', delay: '0s', points: '20,0 11,46 22,52 6,110 16,116 2,170', sparks: [[11, 46], [6, 110]] },
  { left: '16%', duration: '8.5s', delay: '2s', points: '18,0 26,38 15,44 30,96 19,102 32,150', sparks: [[15, 44], [19, 102]] },
  { left: '84%', duration: '7.5s', delay: '4s', points: '22,0 13,50 24,56 8,112 18,118 4,165', sparks: [[13, 50], [8, 112]] },
  { left: '94%', duration: '9s', delay: '6s', points: '16,0 25,42 14,48 28,100 17,106 30,152', sparks: [[14, 48], [17, 106]] },
]

export default function Rain() {
  return (
    <div className="rain" aria-hidden="true">
      {Array.from({ length: 60 }).map((_, i) => (
        <span
          key={i}
          className="drop"
          style={{
            left: `${(i * 173) % 100}%`,
            animationDelay: `${(i % 20) * 0.15}s`,
            animationDuration: `${0.6 + (i % 7) * 0.12}s`,
          }}
        />
      ))}
      {BOLTS.map((b, i) => (
        <svg
          key={i}
          className="bolt"
          style={{ left: b.left, animationDuration: b.duration, animationDelay: b.delay }}
          viewBox="0 0 40 180"
          preserveAspectRatio="none"
        >
          <polyline points={b.points} />
          {b.sparks.map(([x, y], j) => (
            <circle key={j} className="bolt-spark" cx={x} cy={y} r="2.4" />
          ))}
        </svg>
      ))}
    </div>
  )
}

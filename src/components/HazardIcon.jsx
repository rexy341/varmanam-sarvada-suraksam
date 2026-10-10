// Original, minimal line-icons for each hazard type — drawn fresh for
// Varman, not copied from any reference image. Kept deliberately simple
// (single stroke weight, no gradients/shading) so they read clearly at
// small tile sizes and stay lightweight.
const ICONS = {
  flood: (
    <>
      <path d="M4 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M4 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    </>
  ),
  cyclone: (
    <path d="M12 4a8 8 0 1 0 6 13M12 4a4 4 0 1 1-3 6.5M12 4v4" />
  ),
  landslide: (
    <>
      <path d="M2 19l6-10 4 6 3-4 7 8H2z" />
      <path d="M15 19c1-2 3-2 4 0" />
    </>
  ),
  collapse: (
    <>
      <path d="M4 21V7l4-2v16" />
      <path d="M13 21l1-10 5 1-2 9z" />
      <path d="M9 21l1.5-4-1-2.5 2-2" />
      <path d="M2 21h20" />
    </>
  ),
  smog: (
    <>
      <path d="M4 10a4 4 0 0 1 4-4 5 5 0 0 1 9.6-1.6A4 4 0 0 1 19 12H6a4 4 0 0 1-2-4Z" />
      <path d="M4 16h13M4 20h9" />
    </>
  ),
  quake: (
    <path d="M2 12h4l2-6 3 12 3-9 2 3h6" />
  ),
}

export default function HazardIcon({ type, size = 24, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[type] || null}
    </svg>
  )
}

// Same conventions as HazardIcon.jsx: single stroke weight, no gradients or shading, drawn
// fresh for Varman. One icon set for request categories, party composition and evidence
// controls, so the whole SOS flow reads as one considered system instead of mixed emoji.
const PATHS = {
  // request categories (PUBLIC_SOS_TYPES)
  trapped: (
    <>
      <path d="M3 11l9-6 9 6" />
      <path d="M5.5 10v9h13v-9" />
      <path d="M10.5 12l1.6 2.2-1.3 1.8 1.6 2.2" />
    </>
  ),
  medical: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  evacuation: (
    <>
      <path d="M5 3v18" />
      <path d="M5 12h12" />
      <path d="M13 8l4 4-4 4" />
    </>
  ),
  food: (
    <>
      <path d="M4.5 12.5c0 4.1 3.4 7.5 7.5 7.5s7.5-3.4 7.5-7.5" />
      <path d="M3.5 12.5h17" />
      <path d="M9 8c0-1 1-1.3 1-2.3S9 4.4 9 3.4" />
      <path d="M14.5 8c0-1 1-1.3 1-2.3s-1-1.3-1-2.3" />
    </>
  ),
  shelter: (
    <>
      <path d="M3 20l9-14 9 14H3z" />
      <path d="M12.5 12L9.5 20M12.5 12l3 8" />
    </>
  ),
  missing: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <circle cx="10.5" cy="8.3" r="1.7" />
      <path d="M8 14c.6-1.6 1.6-2.2 2.5-2.2s1.9.6 2.5 2.2" />
      <path d="M15.2 15.2L21 21" />
    </>
  ),

  // party composition
  people: (
    <>
      <circle cx="8.8" cy="7.8" r="2.3" />
      <path d="M4 19c0-3.3 2.1-5.7 4.8-5.7s4.8 2.4 4.8 5.7" />
      <circle cx="16.2" cy="9" r="2" />
      <path d="M14.4 19c.2-2.8 1.9-4.9 4.3-4.9" />
    </>
  ),
  elderly: (
    <>
      <circle cx="10.5" cy="5.3" r="2.2" />
      <path d="M6.5 20c-.3-4.2 1.4-8 4-8s4.3 3.8 4 8" />
      <path d="M14 12.5l4.5 3-1.5 5" />
    </>
  ),
  pregnant: (
    <>
      <circle cx="11.5" cy="4.8" r="2.1" />
      <path d="M8.7 20c-.7-4.3-.1-7.4 1.4-9 2 .8 5 3.4 4.4 7-.3 1.6-1 2.6-1.7 3.2" />
      <path d="M10.7 11.3c2.1-.7 4 .9 3.9 3.4" />
    </>
  ),
  children: (
    <>
      <circle cx="12" cy="6" r="2.4" />
      <path d="M8.3 20v-6.3C8.3 12 9.9 10.6 12 10.6s3.7 1.4 3.7 3.1V20" />
    </>
  ),

  // evidence controls
  mic: (
    <>
      <rect x="9" y="2.8" width="6" height="11" rx="3" />
      <path d="M5.2 11a6.8 6.8 0 0 0 13.6 0" />
      <path d="M12 17.8V21M9 21h6" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3.2L8.7 6h6.6L16.8 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.2" r="3.3" />
    </>
  ),
}

export default function Icon({ type, size = 22, className = '' }) {
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
      {PATHS[type] || null}
    </svg>
  )
}

// Filled, not stroked — a play/pause glyph reads as a control, not part of the line-icon set
export function PlayerIcon({ type, size = 16, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {type === 'pause' ? (
        <>
          <rect x="6.5" y="4.5" width="3.6" height="15" rx="1.2" />
          <rect x="13.9" y="4.5" width="3.6" height="15" rx="1.2" />
        </>
      ) : (
        <path d="M7.5 4.8v14.4a1 1 0 0 0 1.53.85l11.2-7.2a1 1 0 0 0 0-1.7l-11.2-7.2a1 1 0 0 0-1.53.85z" />
      )}
    </svg>
  )
}

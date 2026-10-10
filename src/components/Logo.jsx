// Original artwork for Varman's mark: two cupped hands supporting a rising
// wave, with a small Om (ॐ) glyph set into the wave crest — a nod to
// protection/shelter (the hands) meeting the hazard the app responds to
// (the wave), grounded with a familiar Indian symbol rather than a generic
// icon. Drawn from scratch as simple original shapes, not traced from any
// reference image.
export default function Logo({ size = 32, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* wave, rising behind the hands */}
      <path
        d="M14 34 C 20 26, 26 26, 32 34 C 38 42, 44 42, 50 34"
        fill="none"
        stroke="#3E8FC9"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M17 41 C 22 35, 27 35, 32 41 C 37 47, 42 47, 47 41"
        fill="none"
        stroke="#1B5FA8"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Om glyph, set small within the wave's crest */}
      <text
        x="32" y="30"
        textAnchor="middle"
        fontSize="14"
        fontFamily="'Noto Sans Devanagari','Segoe UI',sans-serif"
        fill="#D9622B"
        fontWeight="700"
      >
        ॐ
      </text>

      {/* two cupped hands, cradling the wave from below */}
      <path
        d="M8 50 C 8 44, 14 40, 20 41 C 24 42, 27 45, 30 49 L 32 52
           L 30 53 C 26 49, 21 47, 16 47 C 13 47, 10 48, 8 50 Z"
        fill="#0F2A4A"
        stroke="#EAF2FA"
        strokeWidth="1.5"
      />
      <path
        d="M56 50 C 56 44, 50 40, 44 41 C 40 42, 37 45, 34 49 L 32 52
           L 34 53 C 38 49, 43 47, 48 47 C 51 47, 54 48, 56 50 Z"
        fill="#0F2A4A"
        stroke="#EAF2FA"
        strokeWidth="1.5"
      />
    </svg>
  )
}

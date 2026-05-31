/** Tilted credit-card mark - matches brand nav reference (outline, chip, floor line). */
export function BrimCardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-6 16 52 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      overflow="visible"
    >
      {/* floor / slot line */}
      <line x1="2" y1="48" x2="26" y2="48" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      {/* card - tilted ~42° CCW, pivot near bottom-left corner */}
      <g transform="rotate(-42 14 38)">
        <rect x="4" y="10" width="34" height="24" rx="3.5" stroke="currentColor" strokeWidth="2.25" />
        {/* magnetic stripe */}
        <line x1="4" y1="16" x2="38" y2="16" stroke="currentColor" strokeWidth="2.25" />
        {/* chip */}
        <rect x="30" y="20" width="6" height="5" rx="1" fill="currentColor" />
        {/* embossed details */}
        <circle cx="10" cy="26" r="1.1" fill="currentColor" />
        <circle cx="14" cy="26" r="1.1" fill="currentColor" />
        <circle cx="18" cy="26" r="1.1" fill="currentColor" />
        <circle cx="22" cy="26" r="1.1" fill="currentColor" />
        <line x1="10" y1="30" x2="16" y2="30" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <line x1="19" y1="30" x2="24" y2="30" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="10" cy="33" r="1.1" fill="currentColor" />
        <circle cx="14" cy="33" r="1.1" fill="currentColor" />
        <circle cx="18" cy="33" r="1.1" fill="currentColor" />
      </g>
    </svg>
  );
}

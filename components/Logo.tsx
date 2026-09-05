/**
 * NGCRM logo mark: three connected nodes — the relationships at the heart of a
 * CRM — on a rounded accent tile. Mirrors app/icon.svg (the favicon).
 */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Next-Gen CRM logo"
    >
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <g stroke="var(--accent-fg)" strokeWidth="2" strokeLinecap="round">
        <line x1="16" y1="10" x2="9" y2="22" />
        <line x1="16" y1="10" x2="23" y2="22" />
        <line x1="9" y1="22" x2="23" y2="22" />
      </g>
      <g fill="var(--accent-fg)">
        <circle cx="16" cy="10" r="3.2" />
        <circle cx="9" cy="22" r="3.2" />
        <circle cx="23" cy="22" r="3.2" />
      </g>
    </svg>
  );
}

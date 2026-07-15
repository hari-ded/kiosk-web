export function Logo({ className = "h-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          {`
            .arox-text {
              font-family: 'Arial Black', Impact, system-ui, -apple-system, sans-serif;
              font-weight: 900;
              font-size: 96px;
              fill: #000;
              letter-spacing: -6px;
            }
          `}
        </style>
      </defs>
      <text x="10" y="85" className="arox-text">ar</text>
      
      <g transform="translate(135, 10)">
        {/* Orange capsule */}
        <rect x="-10" y="35" width="55" height="32" rx="16" fill="#ffa700" transform="rotate(-45 17 51)" />
        {/* Cyan capsule */}
        <rect x="35" y="-5" width="55" height="32" rx="16" fill="#4fc3f7" transform="rotate(-45 62 11)" />
        {/* Blue circle */}
        <circle cx="55" cy="55" r="28" fill="#2196f3" />
        {/* Red circle */}
        <circle cx="32" cy="32" r="30" fill="#f02c56" />
      </g>

      <text x="230" y="85" className="arox-text">x</text>
    </svg>
  );
}

export function BookAppointmentIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bookGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
        <linearGradient id="plusGrad" x1="12" y1="28" x2="32" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <rect x="8" y="14" width="48" height="44" rx="9" fill="url(#bookGrad)" opacity="0.18" />
      <rect x="12" y="18" width="40" height="34" rx="7" stroke="url(#bookGrad)" strokeWidth="2.5" fill="none" />
      <path d="M20 10v8M44 10v8M12 28h40" stroke="url(#bookGrad)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="44" cy="44" r="10" fill="url(#plusGrad)" />
      <path d="M44 39v10M39 44h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M18 38h10M18 44h7" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function TalkToMaraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="talkGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--secondary)" />
          <stop offset="100%" stopColor="var(--primary)" />
        </linearGradient>
        <linearGradient id="micGrad" x1="24" y1="12" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <rect x="4" y="10" width="56" height="40" rx="12" fill="url(#talkGrad)" opacity="0.18" />
      <rect x="8" y="14" width="48" height="32" rx="10" stroke="url(#talkGrad)" strokeWidth="2.5" fill="none" />
      <path d="M16 50l8-8h20l8 8" stroke="url(#talkGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="26" y="20" width="12" height="18" rx="6" fill="url(#micGrad)" />
      <path d="M32 38v4M24 32a8 8 0 0 0 16 0" stroke="url(#micGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="48" cy="24" r="4" fill="#22c55e" />
      <circle cx="48" cy="24" r="4" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

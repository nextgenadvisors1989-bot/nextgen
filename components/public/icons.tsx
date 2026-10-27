/**
 * The public site's icon set: small stroked SVGs addressed by name, so an editor can pick an icon for a block in the
 * CMS by typing its name. An unknown name draws a plain dot rather than failing.
 */
const PATHS: Record<string, string> = {
  scale: 'M12 3v18M5 21h14M7 6h10M3 14l4-8 4 8a4 4 0 0 1-8 0Zm10 0 4-8 4 8a4 4 0 0 1-8 0Z',
  hardhat: 'M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M10 8V5h4v3',
  leaf: 'M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16ZM4 21c3-6 7-9 12-11',
  alert: 'M12 3 2 20h20L12 3ZM12 10v4M12 17.5v.01',
  droplet: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z',
  lock: 'M6 11h12v10H6V11ZM8 11V8a4 4 0 0 1 8 0v3',
  'user-check': 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM16 11l2 2 4-4',
  building: 'M4 21V4h10v17M14 9h6v12M4 21h16M8 8h2M8 12h2M8 16h2',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4',
  clipboard: 'M9 4h6v3H9V4ZM7 5H5v16h14V5h-2M9 12l2 2 4-4',
  heart: 'M19 14c1.5-1.5 2-3 2-4.5A4.5 4.5 0 0 0 16.5 5 4.5 4.5 0 0 0 12 7.5 4.5 4.5 0 0 0 7.5 5 4.5 4.5 0 0 0 3 9.5C3 11 3.5 12.5 5 14l7 7 7-7Z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  book: 'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5ZM8 7h8M8 11h8',
  shirt: 'm8 3-5 3 2 4 3-1v11h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0Z',
  fuel: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h4',
  factory: 'M3 21V10l6 4v-4l6 4v-4l6 4v7H3ZM17 10V3h3v7',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7v-7Z',
  utensils: 'M5 3v7a2 2 0 0 0 2 2v9M9 3v7a2 2 0 0 1-2 2M19 21V3c-3 1-4 4-4 8h4',
  pill: 'm10.5 20.5-7-7a4.9 4.9 0 0 1 7-7l7 7a4.9 4.9 0 0 1-7 7ZM8.5 8.5l7 7',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1',
  layers: 'm12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  award: 'M12 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8.5 13 7 22l5-3 5 3-1.5-9',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12l3 3 5-6',
  briefcase: 'M3 7h18v13H3V7ZM9 7V4h6v3M3 13h18',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  mail: 'M3 5h18v14H3V5Zm0 1 9 7 9-7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  pin: 'M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevron: 'm6 9 6 6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6 6 18',
  send: 'm22 2-11 11M22 2l-7 20-4-9-9-4 20-7Z',
  calendar: 'M4 6h16v15H4V6ZM4 10h16M8 3v4M16 3v4',
  file: 'M6 3h8l4 4v14H6V3ZM14 3v4h4M9 13h6M9 17h6',
  checksquare: 'M4 4h16v16H4V4Zm4 8 3 3 5-6',
  calculator: 'M6 3h12v18H6V3ZM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  landmark: 'M3 21h18M5 10v8M10 10v8M14 10v8M19 10v8M12 3 3 8h18l-9-5Z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5 13.5 13.5 8.5 15.5l2-5 5-2Z',
  gavel: 'm14 13-8.4 8.4M16 16l6-6M8 8l6-6M9 7l8 8M4 11l4 4',
};

export function SiteIcon({ name, className = 'h-5 w-5', strokeWidth = 1.8 }: { name?: string | null; className?: string; strokeWidth?: number }) {
  const path = PATHS[String(name ?? '').toLowerCase()] ?? 'M12 12h.01';
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function SocialIcon({ name }: { name: 'facebook' | 'linkedin' | 'twitter' | 'instagram' | 'youtube' }) {
  const paths: Record<string, string> = {
    facebook: 'M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.374 14.5 5 15.6 5H18V0h-3.808C10.592 0 9 1.583 9 4.615V8z',
    linkedin: 'M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z',
    twitter: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
    instagram: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0 5.838a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm6.406-1.845a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z',
    youtube: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z',
  };
  return (
    <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}

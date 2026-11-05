// Folio's mark: a moth, its fore wings the lamp's orange, the rest ink
export default function FolioMark({ className, title }) {
  return (
    <svg className={className} viewBox="0 0 48 48" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <g className="wings">
        <path className="wing fore left" d="M23 22C17 10 6 7 3.5 13.5C1.5 19 8 25 22.5 25.5Z" fill="#ff4d17" />
        <path className="wing fore right" d="M25 22C31 10 42 7 44.5 13.5C46.5 19 40 25 25.5 25.5Z" fill="#ff4d17" />
        <path className="wing hind left" d="M22.5 27C15 28 9.5 33 12 38C14.5 42.5 20 37 23 31Z" fill="currentColor" />
        <path className="wing hind right" d="M25.5 27C33 28 38.5 33 36 38C33.5 42.5 28 37 25 31Z" fill="currentColor" />
      </g>
      <rect x="22.4" y="17" width="3.2" height="20" rx="1.6" fill="currentColor" />
      <path d="M23.2 17.5C22 13 19.5 10 16.5 8.5M24.8 17.5C26 13 28.5 10 31.5 8.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

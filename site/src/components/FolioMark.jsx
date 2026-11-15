// Folio's mark: its f, in ink on a square of orange, and a full stop in yellow
export default function FolioMark({ className, title }) {
  return (
    <svg className={className} viewBox="0 0 48 48" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="48" height="48" fill="#ff4d17" />
      <path className="f" d="M17 41V23h-5v-7h5v-2.5C17 8.5 20.5 5 25.5 5H31v7h-4.2c-1.1 0-1.8.7-1.8 1.8V16h6v7h-6v18z" fill="#0c0c0b" />
      <rect className="stop" x="32.5" y="33" width="8" height="8" fill="#f2c84b" />
    </svg>
  );
}

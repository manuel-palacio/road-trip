import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="mt-auto py-4 border-t border-line text-paper-muted text-[11px] tracking-wide flex justify-center gap-4">
      <Link to="/privacy" className="hover:text-accent">Privacy</Link>
      <span aria-hidden>·</span>
      <Link to="/terms" className="hover:text-accent">Terms</Link>
      <span aria-hidden>·</span>
      <span>© {new Date().getFullYear()} Road Trip</span>
    </footer>
  );
}

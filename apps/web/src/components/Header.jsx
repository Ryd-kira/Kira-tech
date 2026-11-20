import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useSettings } from '../lib/settings.jsx';
import { whatsappUrl } from '../lib/whatsapp.js';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';

const LINKS = [['/catalogue', 'Catalogue'], ['/services', 'Services'], ['/a-propos', 'À propos'], ['/contact', 'Contact']];

export default function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const settings = useSettings();
  const wa = whatsappUrl(settings?.whatsappNumber, 'Bonjour, ');
  useEffect(() => setOpen(false), [location.pathname]);

  const navClass = ({ isActive }) =>
    `no-underline text-[15px] py-2.5 ${isActive ? 'text-paper font-semibold shadow-[inset_0_-2px_0_var(--color-blue)]' : 'text-grey font-medium hover:text-paper'}`;

  return (
    <header className="border-b border-line-soft">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-ink focus:p-2">Aller au contenu</a>
      <div className="container-page py-3.5 flex items-center gap-8">
        <Link to="/" className="text-paper no-underline flex items-center mr-auto md:mr-0" aria-label="Accueil">
          <Brand settings={settings} height={34} />
        </Link>
        <nav aria-label="Navigation principale" className="hidden md:flex gap-6 flex-1">
          {LINKS.map(([to, label]) => <NavLink key={to} to={to} className={navClass}>{label}</NavLink>)}
        </nav>
        {wa
          ? <a className="btn btn-primary hidden sm:inline-flex" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="chat" />Écrire sur WhatsApp</a>
          : <Link className="btn btn-primary hidden sm:inline-flex" to="/contact"><Icon name="chat" />Nous contacter</Link>}
        <button type="button" className="btn btn-ghost md:hidden !px-0 w-11" aria-expanded={open} aria-controls="menu-mobile"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'x' : 'menu'} size={22} />
        </button>
      </div>
      {open && (
        <nav id="menu-mobile" aria-label="Navigation principale" className="md:hidden container-page pb-4 flex flex-col">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `no-underline py-3 border-t border-line-soft ${isActive ? 'text-paper font-semibold' : 'text-grey'}`}>{label}</NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

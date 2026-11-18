import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import Icon from '../components/Icon.jsx';
import { useAuth } from './auth.jsx';

// Les rubriques apparaissent au fil des lots ; chacune n'est visible que si le rôle y a droit.
const NAV = [
  { to: '/admin', label: 'Vue générale', end: true },
  { to: '/admin/caisse', label: 'Caisse', perm: 'sales:write' },
  { to: '/admin/produits', label: 'Produits', perm: 'products:write' },
  { to: '/admin/stocks', label: 'Stocks', perm: 'stock:read' },
  { to: '/admin/mouvements', label: 'Mouvements de stock', perm: 'stock:read' },
  { to: '/admin/transferts', label: 'Transferts', perm: 'stock:read' },
  { to: '/admin/achats', label: 'Achats et approvisionnements', perm: 'purchases:receive' },
  { to: '/admin/ventes', label: 'Ventes', perm: 'sales:write' },
  { to: '/admin/reservations', label: 'Réservations', perm: 'reservations:write' },
  { to: '/admin/paiements', label: 'Paiements', perm: 'payments:write' },
  { to: '/admin/livraisons', label: 'Livraisons', perm: 'fulfillments:write' },
  { to: '/admin/clients', label: 'Clients', perm: 'customers:write' },
  { to: '/admin/fournisseurs', label: 'Fournisseurs', perm: 'purchases:receive' },
  { to: '/admin/retours', label: 'Retours et remboursements', perm: 'returns:write' },
  { to: '/admin/series', label: 'Numéros de série', perm: 'stock:read' },
  { to: '/admin/categories', label: 'Catégories', perm: 'categories:write' },
  { to: '/admin/messages', label: 'Messages', perm: 'messages:manage' },
  { to: '/admin/administrateurs', label: 'Administrateurs', perm: 'users:manage' },
  { to: '/admin/journal', label: "Journal d'activité", perm: 'audit:read' },
  { to: '/admin/rapports', label: 'Rapports', perm: 'dashboard:commercial' },
  { to: '/admin/parametres', label: 'Paramètres', perm: 'settings:content' },
];
const ROLE = { SUPER_ADMIN: 'Super administrateur', ADMIN: 'Administrateur', GESTIONNAIRE: 'Gestionnaire' };

export default function AdminLayout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.perm || can(n.perm));

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <div className="lg:hidden flex items-center justify-between bg-ink text-paper px-4 py-3">
        <Link to="/admin" className="!text-paper no-underline font-extrabold" style={{ fontStretch: '125%' }}>KIRA TECH</Link>
        <button type="button" className="btn btn-ghost !bg-transparent !text-paper !border-ctl !px-0 w-11" aria-expanded={open} aria-controls="admin-nav"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setOpen((o) => !o)}><Icon name={open ? 'x' : 'menu'} /></button>
      </div>
      <nav id="admin-nav" aria-label="Administration"
        className={`${open ? 'flex' : 'hidden'} lg:flex flex-col gap-0.5 bg-ink px-3 py-5 lg:w-[240px] lg:shrink-0 lg:min-h-screen`}>
        <div className="hidden lg:block px-3.5 pb-5 text-paper">
          <div className="font-extrabold text-[17px]" style={{ fontStretch: '125%' }}>KIRA TECH</div>
          <div className="text-xs text-grey">Administration</div>
        </div>
        {items.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className="side-link" onClick={() => setOpen(false)}>{n.label}</NavLink>)}
        <div className="mt-6 lg:mt-auto pt-4 px-3.5 border-t border-line-soft text-[13px] text-grey flex flex-col gap-1">
          <span className="text-paper">{user.name}</span>
          <span>{ROLE[user.role]}</span>
          <NavLink to="/admin/mot-de-passe" className="!text-link" onClick={() => setOpen(false)}>Changer mon mot de passe</NavLink>
          <button type="button" className="text-left bg-transparent border-0 p-0 text-link underline underline-offset-[3px] cursor-pointer text-[13px]"
            onClick={async () => { await logout(); navigate('/admin/connexion'); }}>Se déconnecter</button>
        </div>
      </nav>
      <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-7"><Outlet /></main>
    </div>
  );
}

import { Link } from 'react-router';
import { useSettings } from '../lib/settings.jsx';

const telHref = (phone) => `tel:${phone.replace(/[^0-9+]/g, '')}`;

export function StoreLines({ store, settings }) {
  return (
    <>
      <span>{store.address || '[Adresse à fournir]'}</span>
      {store.phone && <a href={telHref(store.phone)}>{store.phone}</a>}
      <span className="whitespace-pre-line">{store.openingHours || settings?.openingHours || '[Horaires à fournir]'}</span>
    </>
  );
}

export default function Footer() {
  const settings = useSettings();
  const stores = settings?.stores ?? [];
  return (
    <footer className="border-t border-line-soft mt-24">
      <div className="container-page py-12 grid gap-8 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] text-[15px] text-grey">
        <div className="flex flex-col gap-2">
          <span className="font-extrabold text-paper" style={{ fontStretch: '125%' }}>KIRA TECH et Solution</span>
          <span>Vente de matériel informatique, maintenance et réparation.</span>
          {settings?.phone && <a href={telHref(settings.phone)}>{settings.phone}</a>}
          {settings?.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
        </div>
        {stores.map((s) => (
          <div key={s.code} className="flex flex-col gap-2">
            <span className="text-paper font-semibold">{s.name}</span>
            <StoreLines store={s} settings={settings} />
          </div>
        ))}
        <nav aria-label="Informations légales" className="flex flex-col gap-2">
          <Link to="/conditions-generales">Conditions générales</Link>
          <Link to="/confidentialite">Politique de confidentialité</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
        </nav>
      </div>
    </footer>
  );
}

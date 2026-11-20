import { logoSrc } from '../lib/format.js';

// Logo de la chaîne s'il a été ajouté dans l'administration, sinon le nom en texte.
export default function Brand({ settings, height = 32, subtitle = true }) {
  if (settings?.logoUrl) {
    return <img src={logoSrc(settings.logoUrl, height)} alt={settings.companyName || 'Kira Tech et Solution'} style={{ height }} className="w-auto max-w-[200px] object-contain" />;
  }
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-extrabold text-xl" style={{ fontStretch: '125%' }}>KIRA TECH</span>
      {subtitle && <span className="text-[13px] text-grey">et Solution</span>}
    </span>
  );
}

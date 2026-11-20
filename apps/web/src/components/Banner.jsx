import { Link } from 'react-router';
import { useSettings } from '../lib/settings.jsx';

// Lien interne (/catalogue…) : navigation du site ; lien https : nouvel onglet.
function CtaLink({ url, children }) {
  if (url.startsWith('/')) return <Link className="btn btn-primary self-start" to={url}>{children}</Link>;
  return <a className="btn btn-primary self-start" href={url} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (nouvel onglet)</span></a>;
}

// Bannière de l'accueil : saisie dans Paramètres, absente tant qu'elle n'est pas activée.
export default function Banner() {
  const banner = useSettings()?.banner;
  if (!banner) return null;
  const { title, text, ctaLabel, ctaUrl, image } = banner;
  return (
    <section aria-label="Annonce" className="container-page pt-6 md:pt-8">
      <div className={`bg-night border border-line rounded-[10px] overflow-hidden grid ${image ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : ''}`}>
        <div className={`flex flex-col justify-center gap-4 p-6 md:p-10 ${image ? '' : 'border-l-4 border-blue'}`}>
          <h2 className="text-[clamp(26px,3.2vw,39px)] text-balance">{title}</h2>
          {text && <p className="m-0 text-grey text-[17px] max-w-[52ch] whitespace-pre-line">{text}</p>}
          {ctaLabel && ctaUrl && <CtaLink url={ctaUrl}>{ctaLabel}</CtaLink>}
        </div>
        {image && (
          <img src={image.url} alt="" width={image.width ?? undefined} height={image.height ?? undefined} fetchPriority="high"
            className="w-full h-full min-h-[200px] max-h-[380px] object-cover bg-ink-2 order-first md:order-none" />
        )}
      </div>
    </section>
  );
}

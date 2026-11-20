import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { conditionLabel, storageParts } from '../lib/format.js';
import { productMessage } from '../lib/whatsapp.js';
import AvailabilityBadge from './AvailabilityBadge.jsx';
import Photo from './Photo.jsx';
import Price from './Price.jsx';
import { SpecCell } from './Spec.jsx';
import WhatsAppButton from './WhatsAppButton.jsx';

// Vitrine de l'accueil : 2 à 4 ordinateurs mis en avant. Un onglet par ordinateur ;
// la scène affiche sa photo et, à côté, son texte et ses caractéristiques clés.
// Rien ne défile tout seul : le visiteur choisit (clic, toucher ou flèches du clavier).
export default function Showcase({ items }) {
  const [index, setIndex] = useState(0);
  const tabs = useRef([]);
  const current = items[Math.min(index, items.length - 1)];

  function onKeyDown(e) {
    const last = items.length - 1;
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const i = next < 0 ? last : next > last ? 0 : next;
    setIndex(i);
    tabs.current[i]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <Stage product={current} id={`vitrine-${index}`} labelledBy={`vitrine-tab-${index}`} />
      {/* Sur mobile, les onglets passent au-dessus : la scène change juste en dessous du doigt. */}
      <div role="tablist" aria-label="Ordinateurs mis en avant" onKeyDown={onKeyDown}
        className={`order-first md:order-none grid gap-2 ${items.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : items.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {items.map((p, i) => {
          const selected = i === index;
          const sto = storageParts(p.storageGb);
          return (
            <button key={p.slug} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`vitrine-tab-${i}`}
              aria-selected={selected} aria-controls={`vitrine-${i}`} tabIndex={selected ? 0 : -1} onClick={() => setIndex(i)}
              className={`text-left rounded-[10px] border px-4 py-3 flex gap-3 items-center min-w-0 cursor-pointer transition-colors
                ${selected ? 'border-blue bg-night shadow-[inset_0_-3px_0_var(--color-blue)]' : 'border-line bg-transparent hover:border-ctl hover:bg-night/60'}`}>
              <Photo image={p.image} alt="" label="" className="size-14 shrink-0 rounded-[6px] hidden sm:block" />
              <span className="flex flex-col min-w-0">
                <span className={`font-semibold leading-snug line-clamp-2 ${selected ? 'text-paper' : 'text-grey'}`}>{p.name}</span>
                <span className="num text-[13px] text-grey">{[p.ramGb && `${p.ramGb} Go`, sto && `${sto.value} ${sto.unit}`].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stage({ product: p, id, labelledBy }) {
  const sto = storageParts(p.storageGb);
  const href = `/produits/${p.slug}`;
  return (
    <div role="tabpanel" id={id} aria-labelledby={labelledBy}
      className="bg-night border border-line rounded-[10px] overflow-hidden grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Link to={href} tabIndex={-1} aria-hidden="true" className="block bg-ink-2 md:border-r border-b md:border-b-0 border-line">
        <Photo key={p.slug} image={p.image} alt={p.name} eager className="w-full h-full aspect-[4/3] md:aspect-auto md:min-h-[420px]" sizes="(min-width: 768px) 640px, 100vw" />
      </Link>
      <div className="p-6 md:p-8 flex flex-col gap-5 min-w-0">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-grey">{p.brand} · {conditionLabel(p.condition)}</span>
          <h2 className="text-[clamp(26px,2.8vw,36px)] text-balance">
            <Link to={href} className="text-paper no-underline hover:underline">{p.name}</Link>
          </h2>
          {p.summary && <p className="m-0 text-grey max-w-[52ch]">{p.summary}</p>}
        </div>
        <div className="grid grid-cols-2 border border-line rounded-[6px]">
          <SpecCell value={p.ramGb} unit="Go" label="Mémoire vive" className="border-r border-b border-line" />
          <SpecCell value={sto?.value} unit={sto?.unit} label={p.storageType ? `Stockage ${p.storageType}` : 'Stockage'} className="border-b border-line" />
          <SpecCell value={p.processor} label="Processeur" className="col-span-2" />
        </div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap mt-auto">
          <Price product={p} size="lg" />
          <AvailabilityBadge availability={p.availability} />
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link to={href} className="btn btn-primary">Voir la fiche complète</Link>
          <WhatsAppButton variant="ghost" message={productMessage(p)} contactState={{ product: p.slug, name: p.name }} />
        </div>
      </div>
    </div>
  );
}

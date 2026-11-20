import { Link } from 'react-router';
import { storageParts } from '../lib/format.js';
import Photo from './Photo.jsx';
import Price from './Price.jsx';
import { SpecCell } from './Spec.jsx';

// Carte volontairement courte : nom, mémoire vive, stockage et prix.
// Le reste (processeur, état, disponibilité, WhatsApp) est sur la fiche, via « Voir plus ».
export default function ProductCard({ product }) {
  const sto = storageParts(product.storageGb);
  const href = `/produits/${product.slug}`;
  return (
    <article className="group bg-night border border-line rounded-[10px] overflow-hidden flex flex-col min-w-0 hover:border-ctl transition-colors">
      <Link to={href} tabIndex={-1} aria-hidden="true" className="block border-b border-line">
        <Photo image={product.image} alt={product.name} className="w-full aspect-[4/3]" sizes="(min-width: 1024px) 300px, 100vw" />
      </Link>
      <h3 className="px-4 pt-4 text-lg font-[650] leading-snug" style={{ fontStretch: '105%' }}>
        <Link to={href} className="text-paper no-underline hover:underline">{product.name}</Link>
      </h3>
      <div className="grid grid-cols-2 mx-4 my-3 border border-line rounded-[6px]">
        <SpecCell value={product.ramGb} unit="Go" label="Mémoire vive" className="border-r border-line" />
        <SpecCell value={sto?.value} unit={sto?.unit} label="Stockage" />
      </div>
      <div className="px-4 pb-4 pt-1 mt-auto flex flex-col gap-3">
        <Price product={product} />
        <Link to={href} className="btn btn-ghost w-full" aria-label={`Voir plus : ${product.name}`}>Voir plus</Link>
      </div>
    </article>
  );
}

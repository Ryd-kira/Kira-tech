import { Link } from 'react-router';
import { conditionLabel, storageParts } from '../lib/format.js';
import { productMessage } from '../lib/whatsapp.js';
import AvailabilityBadge from './AvailabilityBadge.jsx';
import Photo from './Photo.jsx';
import Price from './Price.jsx';
import { SpecCell } from './Spec.jsx';
import WhatsAppButton from './WhatsAppButton.jsx';

export default function ProductCard({ product }) {
  const sto = storageParts(product.storageGb);
  const href = `/produits/${product.slug}`;
  return (
    <article className="bg-night border border-line rounded-[10px] overflow-hidden flex flex-col min-w-0">
      <Link to={href} tabIndex={-1} aria-hidden="true" className="block border-b border-line">
        <Photo image={product.image} alt={product.name} className="w-full aspect-[4/3]" sizes="(min-width: 1024px) 300px, 100vw" />
      </Link>
      <div className="px-4 pt-4 pb-1 flex flex-col gap-1">
        <div className="flex justify-between gap-2 text-[13px] text-grey"><span>{product.brand}</span><span>{conditionLabel(product.condition)}</span></div>
        <h3 className="text-lg font-[650] leading-snug" style={{ fontStretch: '105%' }}>
          <Link to={href} className="text-paper no-underline hover:underline">{product.name}</Link>
        </h3>
      </div>
      <div className="grid grid-cols-2 mx-4 my-3 border border-line rounded-[6px]">
        <SpecCell value={product.ramGb} unit="Go" label="Mémoire vive" className="border-r border-b border-line" />
        <SpecCell value={sto?.value} unit={sto?.unit} label={product.storageType ? `Stockage ${product.storageType}` : 'Stockage'} className="border-b border-line" />
        <SpecCell value={product.processor} label="Processeur" className="col-span-2" />
      </div>
      <div className="px-4 pb-4 pt-1 mt-auto flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <Price product={product} />
          <AvailabilityBadge availability={product.availability} />
        </div>
        <WhatsAppButton variant="ghost" className="w-full" message={productMessage(product)} contactState={{ product: product.slug, name: product.name }} />
      </div>
    </article>
  );
}

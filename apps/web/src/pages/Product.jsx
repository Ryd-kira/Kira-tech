import { useState } from 'react';
import { Link, useParams } from 'react-router';
import AvailabilityBadge from '../components/AvailabilityBadge.jsx';
import Photo from '../components/Photo.jsx';
import Price from '../components/Price.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import { SpecCell } from '../components/Spec.jsx';
import { ErrorState, NotFoundBlock } from '../components/States.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import { conditionLabel, PERFORMANCE, screenLabel, storageLabel, storageParts } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';
import { productMessage } from '../lib/whatsapp.js';

function Gallery({ images, name }) {
  const [index, setIndex] = useState(0);
  const current = images[index];
  return (
    <div className="flex-[1_1_480px] min-w-0 flex flex-col gap-3">
      <Photo image={current} alt={name} eager className="w-full aspect-[4/3] rounded-lg border border-line" sizes="(min-width: 1024px) 600px, 100vw" />
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-3">
          {images.map((img, i) => (
            <button key={img.url} type="button" onClick={() => setIndex(i)} aria-label={`Afficher la photo ${i + 1}`} aria-current={i === index}
              className={`p-0 rounded-md overflow-hidden cursor-pointer bg-transparent border-2 ${i === index ? 'border-blue' : 'border-line'}`}>
              <Photo image={img} alt="" className="w-full aspect-square" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Product() {
  const { slug } = useParams();
  const { data, error, loading, retry } = useApi(`/public/products/${encodeURIComponent(slug)}`);

  if (error?.status === 404) return <div className="container-page"><Seo title="Produit introuvable" noindex /><NotFoundBlock title="Produit introuvable" text="Ce produit n'est plus en ligne ou l'adresse est incorrecte." /></div>;
  if (error) return <div className="container-page py-10"><ErrorState error={error} onRetry={retry} /></div>;
  if (loading && !data) return <div className="container-page py-10 text-grey" aria-live="polite">Chargement du produit…</div>;

  const { product: p, similar } = data;
  const sto = storageParts(p.storageGb);
  const rows = [
    ['Processeur', p.processor], ['Mémoire vive', p.ramGb && `${p.ramGb} Go`],
    ['Stockage', p.storageGb && `${storageLabel(p.storageGb)}${p.storageType ? ` ${p.storageType}` : ''}`],
    ['Carte graphique', p.gpu], ['Écran', screenLabel(p.screenSizeInch)], ['Résolution', p.resolution],
    ['Système', p.operatingSystem], ['Performance', PERFORMANCE[p.performanceLevel]],
    ['Couleur', p.color], ['Écran tactile', p.isTouchscreen ? 'Oui' : null],
    ...(p.extraSpecs ?? []).map((x) => [x.label, x.value]),
    ['Autonomie', p.batteryNote],
    ['Usages recommandés', p.usages.map((u) => u.label).join(', ')],
    ['État', p.conditionNote ? `${conditionLabel(p.condition)}, ${p.conditionNote.charAt(0).toLowerCase()}${p.conditionNote.slice(1)}` : conditionLabel(p.condition)],
    ['Garantie', p.warrantyMonths ? `${p.warrantyMonths} mois` : null],
  ].filter(([, v]) => v);
  const message = productMessage(p);

  return (
    <div className="container-page pt-7 pb-24 md:pb-0">
      <Seo title={p.name} description={`${p.name} (${p.brand}) : ${rows.slice(0, 3).map(([, v]) => v).join(', ')}. Disponible à Cotonou et Calavi.`} />
      <nav aria-label="Fil d'Ariane" className="text-sm text-grey mb-7 flex gap-2 flex-wrap">
        <Link to="/">Accueil</Link><span aria-hidden="true">/</span>
        <Link to={`/categories/${p.category.slug}`}>{p.category.name}</Link><span aria-hidden="true">/</span>
        <span aria-current="page" className="text-paper">{p.name}</span>
      </nav>
      <div className="flex flex-wrap gap-14 items-start">
        <Gallery images={p.images} name={p.name} />
        <div className="flex-[1_1_420px] min-w-0 flex flex-col gap-6">
          <div className="flex flex-col gap-2.5">
            <div className="text-sm text-grey">{p.brand}, {conditionLabel(p.condition).toLowerCase()}</div>
            <h1 className="text-[clamp(31px,3.4vw,43px)]">{p.name}</h1>
            <div className="num text-sm text-grey">Référence {p.sku}</div>
          </div>
          <div className="grid grid-cols-3 border border-line rounded-lg">
            <SpecCell value={p.ramGb} unit="Go" label="Mémoire vive" className="border-r border-line" />
            <SpecCell value={sto?.value} unit={sto?.unit} label={p.storageType ? `Stockage ${p.storageType}` : 'Stockage'} className="border-r border-line" />
            <SpecCell value={p.screenSizeInch == null ? null : String(p.screenSizeInch).replace('.', ',')} unit="″" label="Écran" />
          </div>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <Price product={p} size="lg" />
            <AvailabilityBadge availability={p.availability} />
          </div>
          <div className="flex flex-col gap-2.5">
            <WhatsAppButton className="!min-h-[52px] !text-base hidden md:inline-flex" message={message} contactState={{ product: p.slug, name: p.name }} />
            <p className="m-0 text-[13px] text-grey">Message prérempli : « {message} »</p>
          </div>
          {p.description && <p className="m-0 text-grey whitespace-pre-line">{p.description}</p>}
        </div>
      </div>

      <section className="mt-18 flex flex-wrap gap-14 mt-[72px]">
        <div className="flex-[1_1_480px] min-w-0">
          <h2 className="text-[25px] mb-3">Fiche technique</h2>
          <table className="w-full border-collapse text-[15px]">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row" className="text-left font-medium text-grey py-3.5 pr-4 border-b border-line-soft w-2/5">{k}</th>
                  <td className="num py-3.5 border-b border-line-soft">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex-[1_1_360px] min-w-0 flex flex-col gap-3">
          <h2 className="text-[25px]">Voir l'appareil en boutique</h2>
          <p className="m-0 text-grey">Demandez sur WhatsApp dans quelle boutique il se trouve avant de vous déplacer : Cotonou ou Calavi.</p>
        </div>
      </section>

      {/* Sur téléphone, le contact reste à portée de pouce pendant la lecture de la fiche. */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-10 bg-ink border-t border-line px-4 pt-3 pb-5 flex items-center gap-3">
        <div className="shrink-0"><Price product={p} size="sm" /></div>
        <WhatsAppButton className="flex-1" message={message} contactState={{ product: p.slug, name: p.name }} />
      </div>

      {similar.length > 0 && (
        <section className="mt-20 flex flex-col gap-6">
          <h2 className="text-[25px]">Modèles proches</h2>
          <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {similar.map((s) => <ProductCard key={s.slug} product={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}

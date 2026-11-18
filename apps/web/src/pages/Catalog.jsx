import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import Icon from '../components/Icon.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import { CardSkeleton, EmptyState, ErrorState, NotFoundBlock } from '../components/States.jsx';
import { toQuery } from '../lib/api.js';
import { storageLabel } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

const MULTI = ['category', 'ram', 'storage', 'usage', 'performance', 'condition', 'budget'];
const SORTS = [['new', 'Nouveautés'], ['price_asc', 'Prix croissant'], ['price_desc', 'Prix décroissant']];
const read = (sp, k) => (sp.get(k) ? sp.get(k).split(',').filter(Boolean) : []);

function buildGroups(filters, withCategory) {
  if (!filters) return [];
  return [
    withCategory && { key: 'category', label: 'Catégorie', options: filters.categories.map((c) => ({ value: c.slug, label: c.name })) },
    { key: 'ram', label: 'Mémoire vive', options: filters.ram.map((v) => ({ value: String(v), label: `${v} Go` })) },
    { key: 'storage', label: 'Stockage', options: filters.storage.map((v) => ({ value: String(v), label: storageLabel(v) })) },
    { key: 'usage', label: 'Usage', options: filters.usages.map((u) => ({ value: u.slug, label: u.label })) },
    { key: 'performance', label: 'Performance', options: filters.performance },
    { key: 'budget', label: 'Budget', options: filters.budget.map((b) => ({ value: b.id, label: b.label })) },
    { key: 'condition', label: 'État', options: filters.condition },
  ].filter((g) => g && g.options.length > 0);
}

function FilterPanel({ groups, selected, onToggle }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <fieldset key={g.key} className="border-0 m-0 p-0 pb-5 border-b border-line-soft">
          <legend className="text-sm font-semibold mb-2.5 p-0">{g.label}</legend>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {g.options.map((o) => (
              <button key={o.value} type="button" className="chip !min-h-9 !text-sm" aria-pressed={selected[g.key].includes(o.value)}
                onClick={() => onToggle(g.key, o.value)}>{o.label}</button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export default function Catalog() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const dialogRef = useRef(null);
  const { data: filters } = useApi('/public/filters');

  const selected = useMemo(() => Object.fromEntries(MULTI.map((k) => [k, read(sp, k)])), [sp]);
  const sort = SORTS.some(([v]) => v === sp.get('sort')) ? sp.get('sort') : 'new';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const q = sp.get('q') ?? '';

  // Recherche : saisie locale, URL mise à jour 350 ms après la dernière frappe.
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => update((next) => (search ? next.set('q', search) : next.delete('q'))), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(mutator) {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      mutator(next);
      next.delete('page');
      return next;
    }, { replace: true });
  }
  const toggle = (key, value) => update((next) => {
    const cur = read(next, key);
    const vals = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    if (vals.length) next.set(key, vals.join(',')); else next.delete(key);
  });
  const reset = () => setSp(new URLSearchParams(), { replace: true });

  const query = toQuery({ ...selected, category: slug ?? selected.category, q, sort, page, limit: 24 });
  const { data, error, loading, retry } = useApi(`/public/products${query}`);

  const category = slug && filters?.categories.find((c) => c.slug === slug);
  if (slug && filters && !category) return <div className="container-page"><NotFoundBlock title="Catégorie introuvable" /></div>;

  const groups = buildGroups(filters, !slug);
  const labelOf = (key, value) => groups.find((g) => g.key === key)?.options.find((o) => o.value === value)?.label ?? value;
  const active = MULTI.flatMap((k) => selected[k].map((v) => ({ key: k, value: v, label: labelOf(k, v) })));
  const title = category ? category.name : 'Catalogue';
  const pageLink = (n) => `?${new URLSearchParams({ ...Object.fromEntries(sp), page: String(n) })}`;

  return (
    <div className="container-page pt-10">
      <Seo title={title} description={`${title} : ordinateurs neufs et d'occasion, filtres par mémoire, stockage, usage et budget. Boutiques à Cotonou et Calavi.`} />
      <div className="flex flex-col gap-2 mb-7">
        {category && <nav aria-label="Fil d'Ariane" className="text-sm text-grey"><Link to="/catalogue">Catalogue</Link> / {category.name}</nav>}
        <h1 className="text-[clamp(31px,4vw,49px)]">{title}</h1>
        <p className="m-0 text-grey">Combinez les filtres : les résultats se mettent à jour à chaque choix.</p>
      </div>
      <div className="flex flex-wrap gap-10 items-start">
        <aside aria-label="Filtres" className="hidden lg:block flex-[1_1_260px] max-w-[300px]">
          <FilterPanel groups={groups} selected={selected} onToggle={toggle} />
        </aside>
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-5">
          <div className="flex gap-3 flex-wrap items-end">
            <label className="label flex-[1_1_280px]">Rechercher un nom ou un modèle
              <span className="relative flex">
                <span className="absolute left-3 top-3 text-grey"><Icon name="search" size={18} /></span>
                <input className="field !pl-10" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex. ThinkPad, RTX 4060" />
              </span>
            </label>
            <label className="label flex-[0_1_220px]">Trier par
              <select className="field" value={sort} onChange={(e) => update((n) => n.set('sort', e.target.value))}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-ghost lg:hidden" onClick={() => dialogRef.current?.showModal()}>
              <Icon name="filter" size={18} />Filtres
              {active.length > 0 && <span className="num bg-blue text-white rounded px-1.5 text-[13px]">{active.length}</span>}
            </button>
          </div>
          {active.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              {active.map((a) => (
                <button key={`${a.key}-${a.value}`} type="button" className="chip !min-h-[34px] !text-sm bg-night" onClick={() => toggle(a.key, a.value)}
                  aria-label={`Retirer le filtre ${a.label}`}>{a.label}<Icon name="x" size={14} /></button>
              ))}
              <button type="button" onClick={reset} className="bg-transparent border-0 text-link underline underline-offset-[3px] cursor-pointer text-sm min-h-[34px] px-2">Réinitialiser les filtres</button>
            </div>
          )}
          <p className="m-0 text-sm text-grey" aria-live="polite">
            {loading ? 'Chargement…' : data ? `${data.total} ${data.total > 1 ? 'produits' : 'produit'}` : ''}
          </p>
          {error && <ErrorState error={error} onRetry={retry} />}
          {!error && data?.items.length === 0 && !loading && (
            <EmptyState title="Aucun produit ne correspond à ces filtres."
              action={active.length > 0 || q ? <button type="button" className="btn btn-ghost" onClick={reset}>Réinitialiser les filtres</button> : null}>
              Retirez un filtre, ou décrivez-nous ce que vous cherchez sur WhatsApp : nous vous dirons ce qui peut arriver.
            </EmptyState>
          )}
          <div className={`grid gap-5 grid-cols-[repeat(auto-fill,minmax(250px,1fr))] ${loading && data ? 'opacity-60' : ''}`}>
            {!data && loading && Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
            {data?.items.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
          {data && data.pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-3 pt-3">
              {page > 1 ? <Link className="btn btn-ghost" to={pageLink(page - 1)}><Icon name="chevronLeft" size={18} />Précédent</Link> : <span />}
              <span className="num text-sm text-grey">Page {page} sur {data.pages}</span>
              {page < data.pages ? <Link className="btn btn-ghost" to={pageLink(page + 1)}>Suivant<Icon name="chevronRight" size={18} /></Link> : <span />}
            </nav>
          )}
        </div>
      </div>
      <dialog ref={dialogRef} aria-label="Filtres" className="m-0 ml-auto h-full max-h-none w-[min(420px,100%)] max-w-none bg-ink text-paper border-0 border-l border-line p-0 backdrop:bg-black/60">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft sticky top-0 bg-ink">
          <h2 className="text-xl">Filtres</h2>
          <button type="button" className="btn btn-ghost !px-0 w-11" aria-label="Fermer les filtres" onClick={() => dialogRef.current?.close()}><Icon name="x" /></button>
        </div>
        <div className="p-4"><FilterPanel groups={groups} selected={selected} onToggle={toggle} /></div>
        <div className="sticky bottom-0 bg-ink border-t border-line-soft p-4 flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={reset}>Réinitialiser</button>
          <button type="button" className="btn btn-primary flex-1" onClick={() => dialogRef.current?.close()}>
            {data ? `Voir les ${data.total} résultats` : 'Voir les résultats'}
          </button>
        </div>
      </dialog>
    </div>
  );
}

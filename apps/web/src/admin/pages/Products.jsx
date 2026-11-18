import { Link, useSearchParams } from 'react-router';
import { toQuery } from '../../lib/api.js';
import { formatFCFA } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';
import { Notice, PageHeader, Pager, STATUS_LABELS, STOCK_COLORS } from '../ui.jsx';

export default function Products() {
  const [sp, setSp] = useSearchParams();
  const f = { q: sp.get('q') ?? '', status: sp.get('status') ?? '', categoryId: sp.get('categoryId') ?? '', stock: sp.get('stock') ?? '', page: Number(sp.get('page')) || 1 };
  const { data: cats } = useApi('/admin/categories');
  const { data, error, loading } = useApi(`/admin/products${toQuery({ ...f, limit: 50 })}`);
  const set = (k) => (e) => setSp((prev) => { const n = new URLSearchParams(prev); if (e.target.value) n.set(k, e.target.value); else n.delete(k); n.delete('page'); return n; }, { replace: true });

  return (
    <>
      <PageHeader title="Produits" subtitle={data ? `${data.total} produit${data.total > 1 ? 's' : ''}` : ' '}
        actions={<Link className="btn btn-primary" to="/admin/produits/nouveau">Nouveau produit</Link>} />
      <div className="flex flex-wrap gap-3 mb-4">
        <label className="label flex-[2_1_240px]">Rechercher<input className="field" type="search" defaultValue={f.q} placeholder="Nom, marque ou référence"
          onKeyDown={(e) => { if (e.key === 'Enter') set('q')(e); }} onBlur={set('q')} /></label>
        <label className="label flex-[1_1_160px]">Statut<select className="field" value={f.status} onChange={set('status')}>
          <option value="">Brouillons et en ligne</option><option value="PUBLISHED">En ligne</option><option value="DRAFT">Brouillons</option><option value="ARCHIVED">Archivés</option>
        </select></label>
        <label className="label flex-[1_1_180px]">Catégorie<select className="field" value={f.categoryId} onChange={set('categoryId')}>
          <option value="">Toutes</option>{cats?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="label flex-[1_1_160px]">Stock<select className="field" value={f.stock} onChange={set('stock')}>
          <option value="">Tous</option><option value="IN_STOCK">Disponible</option><option value="LOW_STOCK">Stock faible</option><option value="OUT_OF_STOCK">Rupture</option>
        </select></label>
      </div>
      {error && <Notice kind="error">{error.message}</Notice>}
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Produit</th><th>Catégorie</th><th className="text-right">Prix</th><th>Stock</th><th>Statut</th></tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={5} className="muted">Chargement…</td></tr>}
            {data?.items.length === 0 && <tr><td colSpan={5} className="muted">Aucun produit ne correspond. <Link to="/admin/produits/nouveau">Créer un produit</Link></td></tr>}
            {data?.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="flex items-center gap-3">
                    {p.images[0] ? <img src={p.images[0].url} alt="" width="48" height="36" className="w-12 h-9 object-cover rounded border border-[#DDE3EC]" loading="lazy" />
                      : <span className="w-12 h-9 rounded border border-dashed border-[#C9D1DD] shrink-0" aria-hidden="true" />}
                    <div><Link to={`/admin/produits/${p.id}`} className="font-semibold">{p.name}</Link><div className="num muted text-[13px]">{p.sku}</div></div>
                  </div>
                </td>
                <td>{p.category.name}</td>
                <td className="num text-right whitespace-nowrap">{formatFCFA(p.price)}{!p.showPrice && <div className="muted text-[12px]">masqué sur le site</div>}</td>
                <td className="whitespace-nowrap"><span className="num font-semibold" style={{ color: STOCK_COLORS[p.stock.status] }}>{p.stock.quantity}</span> <span className="muted text-[13px]">{p.isManuallyUnavailable ? 'désactivé' : p.stock.label.toLowerCase()}</span></td>
                <td>{STATUS_LABELS[p.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={f.page} onPage={(n) => setSp((prev) => { const s = new URLSearchParams(prev); s.set('page', n); return s; })} />
      </div>
    </>
  );
}

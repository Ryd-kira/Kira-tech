import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { ConfirmDialog, Field, fieldErrors, Notice, PageHeader, STATUS_LABELS, STOCK_COLORS } from '../ui.jsx';
import { applyFiche, FIELD_LABELS, parseFiche } from '../../lib/parseFiche.js';
import ProductImages from './ProductImages.jsx';

const EMPTY = {
  name: '', sku: '', brand: '', categoryId: '', description: '', condition: 'NEW', status: 'DRAFT',
  processor: '', ramGb: '', storageGb: '', storageType: 'SSD', gpu: '', screenSizeInch: '', resolution: '', operatingSystem: '',
  performanceLevel: '', warrantyMonths: '', price: '', showPrice: true, lowStockThreshold: 2,
  isManuallyUnavailable: false, isFeatured: false, isSerialized: false, usageSlugs: [],
  color: '', isTouchscreen: false, conditionNote: '', batteryNote: '', extraSpecs: [],
};
const SPEC_LABELS = ['Format', 'Clavier', 'Caméras', 'Sécurité', 'Cœurs / threads', 'Type de mémoire', 'Stockage', 'Écran', 'Ports', 'Connectivité', 'Accessoires inclus', 'Poids'];
const CONDITION_NOTES = ['Comme neuf', 'Très propre', 'Bon état', 'État correct, traces d’usage'];
const RAM = [4, 8, 12, 16, 24, 32, 64];
const STORAGE = [[128, '128 Go'], [256, '256 Go'], [512, '512 Go'], [1024, '1 To'], [2048, '2 To']];
const NUMERIC = ['ramGb', 'storageGb', 'screenSizeInch', 'warrantyMonths', 'price', 'lowStockThreshold'];

function toForm(p) {
  const f = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) if (p[k] !== undefined && p[k] !== null) f[k] = p[k];
  f.categoryId = p.category.id;
  f.usageSlugs = p.usages.map((u) => u.slug);
  return f;
}

// Convertit le formulaire en charge utile : nombres typés, champs de prix retirés si le rôle ne les gère pas.
function toPayload(form, { canPrice, initial }) {
  const out = {};
  for (const [k, v] of Object.entries(form)) {
    if (!canPrice && (k === 'price' || k === 'showPrice')) continue;
    if (NUMERIC.includes(k)) out[k] = v === '' || v == null ? null : Number(String(v).replace(',', '.').replace(/\s/g, ''));
    else if (k === 'performanceLevel') out[k] = v || null;
    else if (k === 'extraSpecs') out[k] = (v ?? []).map((x) => ({ label: x.label.trim(), value: x.value.trim() })).filter((x) => x.label && x.value);
    else out[k] = v;
  }
  if (out.price == null) delete out.price;
  if (out.lowStockThreshold == null) out.lowStockThreshold = 0;
  if (initial) for (const k of Object.keys(out)) if (JSON.stringify(out[k]) === JSON.stringify(initial[k])) delete out[k];
  return out;
}

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { can } = useAuth();
  const canPrice = can('products:price');
  const { data: cats } = useApi('/admin/categories');
  const { data: tags } = useApi('/admin/categories/usage-tags');
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errs = fieldErrors(error);
  const [ficheText, setFicheText] = useState('');
  const [parsed, setParsed] = useState(null);

  async function load() {
    const p = await api(`/admin/products/${id}`);
    setProduct(p);
    const f = toForm(p);
    setForm(f);
    setInitial(toPayload(f, { canPrice }));
  }
  useEffect(() => { if (!isNew) load().catch(setError); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleUsage = (slug) => setForm((f) => ({ ...f, usageSlugs: f.usageSlugs.includes(slug) ? f.usageSlugs.filter((s) => s !== slug) : [...f.usageSlugs, slug] }));

  async function save(e, override) {
    e?.preventDefault();
    setBusy(true); setError(null); setSaved(null);
    try {
      const payload = { ...toPayload(form, { canPrice, initial: isNew ? null : initial }), ...override };
      if (!isNew && Object.keys(payload).length === 0) { setSaved('Aucune modification à enregistrer.'); return; }
      if (isNew) {
        const created = await api('/admin/products', { method: 'POST', body: payload });
        navigate(`/admin/produits/${created.id}`, { replace: true, state: { created: true } });
      } else {
        await api(`/admin/products/${id}`, { method: 'PATCH', body: payload });
        await load();
        setSaved('Modifications enregistrées.');
      }
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  function analyseFiche() {
    const r = parseFiche(ficheText);
    const known = new Set((tags?.items ?? []).map((t) => t.slug));
    if (r.fields.usageSlugs) r.fields.usageSlugs = r.fields.usageSlugs.filter((x) => known.has(x));
    if (r.fields.usageSlugs?.length === 0) delete r.fields.usageSlugs;
    setParsed(r);
  }
  function applyParsed() {
    setForm((f) => applyFiche(f, parsed));
    setParsed(null); setFicheText('');
    setSaved('Fiche appliquée au formulaire : vérifiez les champs, puis enregistrez.');
  }
  const setSpec = (i, k) => (e) => setForm((f) => ({ ...f, extraSpecs: f.extraSpecs.map((s, j) => (j === i ? { ...s, [k]: e.target.value } : s)) }));
  const addSpec = () => setForm((f) => ({ ...f, extraSpecs: [...f.extraSpecs, { label: '', value: '' }] }));
  const removeSpec = (i) => setForm((f) => ({ ...f, extraSpecs: f.extraSpecs.filter((_, j) => j !== i) }));
  async function remove() {
    setBusy(true);
    try { await api(`/admin/products/${id}`, { method: 'DELETE' }); navigate('/admin/produits', { replace: true }); }
    catch (err) { setError(err); setConfirmDelete(false); } finally { setBusy(false); }
  }

  if (!isNew && !product && !error) return <p className="muted">Chargement…</p>;
  if (!isNew && !product && error) return <Notice kind="error">{error.message}</Notice>;

  const ramOptions = [...new Set([...RAM, Number(form.ramGb) || null].filter(Boolean))].sort((a, b) => a - b);
  const storageOptions = !form.storageGb || STORAGE.some(([v]) => v === Number(form.storageGb))
    ? STORAGE : [...STORAGE, [Number(form.storageGb), `${form.storageGb} Go`]].sort((a, b) => a[0] - b[0]);
  const shown = (k, v) => (typeof v === 'boolean' ? 'Oui' : k === 'usageSlugs' ? v.map((x) => tags?.items.find((t) => t.slug === x)?.label ?? x).join(', ') : k === 'condition' ? (v === 'NEW' ? 'Neuf' : 'Occasion') : String(v));
  const input = (k, props = {}) => <input className="field" value={form[k] ?? ''} onChange={set(k)} aria-invalid={!!errs[k]} {...props} />;
  const check = (k, label, hint) => (
    <label className="flex items-start gap-2.5 text-[15px] cursor-pointer">
      <input type="checkbox" className="mt-1 size-4 accent-[#176BFF]" checked={!!form[k]} onChange={set(k)} />
      <span>{label}{hint && <span className="block muted text-[13px]">{hint}</span>}</span>
    </label>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-5 max-w-[1100px]" noValidate>
      <PageHeader title={isNew ? 'Nouveau produit' : product.name}
        subtitle={isNew ? 'Le produit est créé en brouillon : il n’apparaît sur le site qu’une fois mis en ligne.' : `${STATUS_LABELS[product.status]}, référence ${product.sku}`}
        actions={<>
          {!isNew && product.status === 'PUBLISHED' && <a className="btn btn-ghost" href={`/produits/${product.slug}`} target="_blank" rel="noopener noreferrer">Voir sur le site</a>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : isNew ? 'Créer le produit' : 'Enregistrer'}</button>
        </>} />
      {saved && <Notice kind="success">{saved}</Notice>}
      {error && <Notice kind="error">{error.message}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <details className="panel p-5" open={isNew}>
            <summary className="cursor-pointer text-lg font-semibold">Remplir depuis une fiche produit</summary>
            <div className="mt-4 flex flex-col gap-3">
              <p className="muted m-0 text-sm">Collez la fiche (une caractéristique par ligne, les emojis sont acceptés). Rien n’est enregistré : vous vérifiez d’abord ce qui est reconnu.</p>
              <textarea className="field !min-h-[160px] !py-2.5" value={ficheText} onChange={(e) => { setFicheText(e.target.value); setParsed(null); }} aria-label="Fiche produit à analyser" />
              <div><button type="button" className="btn btn-ghost" disabled={!ficheText.trim()} onClick={analyseFiche}>Analyser la fiche</button></div>
              {parsed && (
                <div className="flex flex-col gap-3" aria-live="polite">
                  {Object.keys(parsed.fields).length + parsed.extraSpecs.length === 0 && <Notice kind="error">Rien n’a été reconnu dans ce texte.</Notice>}
                  {Object.keys(parsed.fields).length > 0 && (
                    <ul className="m-0 pl-5 text-[15px]">{Object.entries(parsed.fields).map(([k, v]) => <li key={k}><strong>{FIELD_LABELS[k] ?? k}</strong> : {shown(k, v)}</li>)}</ul>
                  )}
                  {parsed.extraSpecs.length > 0 && (
                    <div><p className="m-0 mb-1 text-sm font-semibold">Caractéristiques supplémentaires</p>
                      <ul className="m-0 pl-5 text-[15px]">{parsed.extraSpecs.map((x) => <li key={x.label}><strong>{x.label}</strong> : {x.value}</li>)}</ul></div>
                  )}
                  {parsed.unmatched.length > 0 && (
                    <Notice>Lignes non reconnues, à saisir à la main si besoin : {parsed.unmatched.join(' · ')}</Notice>
                  )}
                  <p className="muted m-0 text-sm">Les champs déjà remplis ne sont pas écrasés (sauf l’état). À compléter vous-même : référence, catégorie, prix, taille d’écran, niveau de performance, photos.</p>
                  <div><button type="button" className="btn btn-primary" onClick={applyParsed} disabled={Object.keys(parsed.fields).length + parsed.extraSpecs.length === 0}>Appliquer au formulaire</button></div>
                </div>
              )}
            </div>
          </details>

          <section className="panel p-5 grid gap-4 sm:grid-cols-2" aria-labelledby="s-id">
            <h2 id="s-id" className="text-lg sm:col-span-2">Identification</h2>
            <div className="sm:col-span-2"><Field label="Nom" error={errs.name}>{input('name', { required: true, maxLength: 160 })}</Field></div>
            <Field label="Référence" hint="Lettres, chiffres, point, tiret" error={errs.sku}>{input('sku', { required: true, maxLength: 60 })}</Field>
            <Field label="Marque" error={errs.brand}>{input('brand', { required: true, maxLength: 60 })}</Field>
            <Field label="Catégorie" error={errs.categoryId}>
              <select className="field" value={form.categoryId} onChange={set('categoryId')} aria-invalid={!!errs.categoryId}>
                <option value="">Choisir…</option>{cats?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="État"><select className="field" value={form.condition} onChange={set('condition')}><option value="NEW">Neuf</option><option value="USED">Occasion</option></select></Field>
            {form.condition === 'USED' && (
              <Field label="Précision sur l’état" error={errs.conditionNote} hint="Affichée sur la fiche : « Occasion, très propre »">
                {input('conditionNote', { maxLength: 120, list: 'condition-notes' })}
                <datalist id="condition-notes">{CONDITION_NOTES.map((n) => <option key={n} value={n} />)}</datalist>
              </Field>
            )}
            <Field label="Couleur" error={errs.color}>{input('color', { maxLength: 40, placeholder: 'Ex. Platine (gris argenté)' })}</Field>
            <div className="sm:col-span-2"><Field label="Description" error={errs.description}>
              <textarea className="field !min-h-[120px] !py-2.5" value={form.description} onChange={set('description')} maxLength={5000} />
            </Field></div>
          </section>

          <section className="panel p-5 grid gap-4 sm:grid-cols-2" aria-labelledby="s-spec">
            <h2 id="s-spec" className="text-lg sm:col-span-2">Caractéristiques</h2>
            <div className="sm:col-span-2"><Field label="Processeur" error={errs.processor}>{input('processor', { placeholder: 'Ex. Core i5-1235U' })}</Field></div>
            <Field label="Mémoire vive (Go)" error={errs.ramGb}>
              <select className="field" value={form.ramGb} onChange={set('ramGb')}><option value="">Non renseignée</option>{ramOptions.map((r) => <option key={r} value={r}>{r} Go</option>)}</select>
            </Field>
            <Field label="Stockage" error={errs.storageGb}>
              <div className="flex gap-2">
                <select className="field" value={form.storageGb} onChange={set('storageGb')}><option value="">Non renseigné</option>{storageOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <select className="field !w-28" value={form.storageType ?? ''} onChange={set('storageType')} aria-label="Type de stockage"><option value="SSD">SSD</option><option value="HDD">HDD</option><option value="NVMe">NVMe</option><option value="">Autre</option></select>
              </div>
            </Field>
            <Field label="Carte graphique" error={errs.gpu}>{input('gpu')}</Field>
            <Field label="Taille d'écran (pouces)" error={errs.screenSizeInch}>{input('screenSizeInch', { inputMode: 'decimal', placeholder: '15,6' })}</Field>
            <Field label="Résolution" error={errs.resolution}>{input('resolution', { placeholder: '1920 × 1080' })}</Field>
            <Field label="Système d'exploitation" error={errs.operatingSystem}>{input('operatingSystem')}</Field>
            <Field label="Niveau de performance">
              <select className="field" value={form.performanceLevel ?? ''} onChange={set('performanceLevel')}>
                <option value="">Non renseigné</option><option value="BASIC">Basique</option><option value="INTERMEDIATE">Intermédiaire</option><option value="ADVANCED">Avancée</option><option value="GAMING">Gaming</option>
              </select>
            </Field>
            <Field label="Garantie (mois)" error={errs.warrantyMonths}>{input('warrantyMonths', { inputMode: 'numeric' })}</Field>
            <Field label="Autonomie / batterie" error={errs.batteryNote} hint="Une mesure vaut mieux qu’un adjectif (ex. « 85 % de santé »)">{input('batteryNote', { maxLength: 120 })}</Field>
            <div className="sm:col-span-2">{check('isTouchscreen', 'Écran tactile')}</div>
            <fieldset className="sm:col-span-2 border-0 p-0 m-0">
              <legend className="label mb-2">Autres caractéristiques</legend>
              <datalist id="spec-labels">{SPEC_LABELS.map((l) => <option key={l} value={l} />)}</datalist>
              {errs.extraSpecs && <p className="text-sm text-[#E5484D] m-0 mb-2">{errs.extraSpecs}</p>}
              <div className="flex flex-col gap-2">
                {form.extraSpecs.map((x, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                    <input className="field" list="spec-labels" maxLength={60} placeholder="Nom (ex. Clavier)" aria-label={`Caractéristique ${i + 1} : nom`} value={x.label} onChange={setSpec(i, 'label')} />
                    <input className="field" maxLength={160} placeholder="Valeur" aria-label={`Caractéristique ${i + 1} : valeur`} value={x.value} onChange={setSpec(i, 'value')} />
                    <button type="button" className="btn btn-ghost" onClick={() => removeSpec(i)} aria-label={`Retirer la caractéristique ${i + 1}`}>Retirer</button>
                  </div>
                ))}
                <div><button type="button" className="btn btn-ghost" onClick={addSpec} disabled={form.extraSpecs.length >= 20}>Ajouter une caractéristique</button></div>
              </div>
            </fieldset>
            <fieldset className="sm:col-span-2 border-0 p-0 m-0">
              <legend className="label mb-2">Usages recommandés</legend>
              <div className="flex flex-wrap gap-2">
                {tags?.items.map((t) => <button key={t.slug} type="button" className="chip !min-h-9 !text-sm" aria-pressed={form.usageSlugs.includes(t.slug)} onClick={() => toggleUsage(t.slug)}>{t.label}</button>)}
              </div>
            </fieldset>
          </section>

          {!isNew && <ProductImages productId={id} images={product.images} onChange={() => load().catch(setError)} />}
        </div>

        <div className="flex flex-col gap-5 min-w-0">
          <section className="panel p-5 flex flex-col gap-4" aria-labelledby="s-pub">
            <h2 id="s-pub" className="text-lg">Publication</h2>
            <Field label="Statut">
              <select className="field" value={form.status} onChange={set('status')}>
                <option value="DRAFT">Brouillon (invisible)</option><option value="PUBLISHED">En ligne</option><option value="ARCHIVED">Archivé</option>
              </select>
            </Field>
            {check('isFeatured', 'Mettre en avant')}
          </section>

          <section className="panel p-5 flex flex-col gap-4" aria-labelledby="s-price">
            <h2 id="s-price" className="text-lg">Prix</h2>
            {!canPrice && <Notice>Le prix est géré par un administrateur.</Notice>}
            <Field label="Prix (FCFA)" error={errs.price}>{input('price', { inputMode: 'numeric', disabled: !canPrice, placeholder: '0' })}</Field>
            <label className="flex items-start gap-2.5 text-[15px] cursor-pointer">
              <input type="checkbox" className="mt-1 size-4 accent-[#176BFF]" checked={!!form.showPrice} onChange={set('showPrice')} disabled={!canPrice} />
              <span>Afficher le prix sur le site<span className="block muted text-[13px]">Sinon : « Prix sur demande ». Le prix reste enregistré.</span></span>
            </label>
          </section>

          <section className="panel p-5 flex flex-col gap-4" aria-labelledby="s-stock">
            <h2 id="s-stock" className="text-lg">Disponibilité</h2>
            {!isNew && (
              <p className="m-0 text-[15px]">
                <span className="num font-bold text-xl" style={{ color: STOCK_COLORS[product.stock.status] }}>{product.stock.quantity}</span>
                <span className="muted"> disponible(s) à la vente, tous emplacements vendables. Les quantités se gèrent dans Stocks.</span>
              </p>
            )}
            <Field label="Seuil de stock faible" error={errs.lowStockThreshold} hint="À ce niveau ou en dessous : « Stock faible »">{input('lowStockThreshold', { inputMode: 'numeric' })}</Field>
            {check('isManuallyUnavailable', 'Rendre indisponible', 'Affiche « Indisponible » sans toucher aux quantités.')}
            {check('isSerialized', 'Suivi par numéro de série', 'Pour les ordinateurs : chaque appareil est suivi individuellement.')}
          </section>

          {!isNew && (
            <section className="panel p-5 flex flex-col gap-3" aria-labelledby="s-danger">
              <h2 id="s-danger" className="text-lg">Retirer le produit</h2>
              <p className="muted m-0 text-sm">Un produit qui a un historique de stock ou de ventes ne peut pas être supprimé : archivez-le.</p>
              <div className="flex gap-2 flex-wrap">
                {product.status !== 'ARCHIVED' && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => save(null, { status: 'ARCHIVED' })}>Archiver</button>}
                <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Supprimer</button>
              </div>
            </section>
          )}
        </div>
      </div>
      <div className="flex gap-2"><button type="submit" className="btn btn-primary" disabled={busy}>{isNew ? 'Créer le produit' : 'Enregistrer'}</button><Link className="btn btn-ghost" to="/admin/produits">Retour à la liste</Link></div>
      {!isNew && (
        <ConfirmDialog open={confirmDelete} title={`Supprimer « ${product.name} » ?`} confirmLabel="Supprimer définitivement" busy={busy}
          onCancel={() => setConfirmDelete(false)} onConfirm={remove}>
          Le produit et ses photos sont supprimés. Cette action ne peut pas être annulée.
        </ConfirmDialog>
      )}
    </form>
  );
}

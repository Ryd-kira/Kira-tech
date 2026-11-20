import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useReloadSettings } from '../../lib/settings.jsx';
import { useApi } from '../../lib/useApi.js';
import { checkImage, uploadBrandingImage } from '../upload.js';
import { ConfirmDialog, Field, fieldErrors, Notice } from '../ui.jsx';

const thumb = (url, t) => url.replace('/upload/', `/upload/f_auto,q_auto,${t}/`);

// Choix d'une image (logo ou bannière) : aperçu, remplacement, retrait.
export function ImagePicker({ label, hint, url, purpose, save, disabled, wide = false }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkImage(file);
    if (problem) { setError(new Error(problem)); return; }
    setError(null);
    setBusy('Envoi de l’image…');
    try { await save(await uploadBrandingImage(purpose, file)); } catch (err) { setError(err); }
    setBusy(null);
  }
  async function remove() {
    setError(null);
    setBusy('Retrait…');
    try { await save(null); } catch (err) { setError(err); }
    setBusy(null);
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="label">{label}</span>
      <div className={`flex gap-4 ${wide ? 'flex-col' : 'items-center flex-wrap'}`}>
        <div className={`border border-[#DDE3EC] rounded-lg bg-[#F5F7FA] flex items-center justify-center overflow-hidden shrink-0 ${wide ? 'w-full aspect-[3/1]' : 'w-[180px] h-[72px] p-2'}`}>
          {url
            ? <img src={thumb(url, wide ? 'c_fill,w_1200,h_400' : 'c_limit,h_112')} alt="" className={wide ? 'w-full h-full object-cover' : 'max-h-full max-w-full object-contain'} />
            : <span className="text-[13px] muted">Aucune image</span>}
        </div>
        {!disabled && (
          <div className="flex gap-2 flex-wrap">
            <label className={`btn btn-ghost cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              {url ? 'Remplacer' : 'Choisir une image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} disabled={!!busy} />
            </label>
            {url && <button type="button" className="btn btn-danger" onClick={remove} disabled={!!busy}>Retirer</button>}
          </div>
        )}
      </div>
      {hint && <span className="text-[13px] muted">{hint}</span>}
      {busy && <Notice>{busy}</Notice>}
      {error && <Notice kind={error.code === 'CLOUDINARY_NOT_CONFIGURED' ? 'warning' : 'error'}>{error.message}</Notice>}
    </div>
  );
}

// ── Logo de la chaîne ──────────────────────────────────────────────────────
export function BrandingPanel({ settings, canEdit, onChange }) {
  const reloadPublic = useReloadSettings();
  async function save(image) {
    await api('/admin/settings/branding/chain-logo', { method: 'PUT', body: { image } });
    onChange(); reloadPublic();
  }
  return (
    <section className="panel p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Logo de la chaîne</h2>
        <p className="muted m-0 text-sm mt-1">{canEdit ? "Affiché dans l'en-tête du site, le pied de page et l'administration. Sans logo, le nom de l'entreprise s'affiche en texte." : 'Modifiable par le super administrateur.'}</p>
      </div>
      <ImagePicker label="Logo général" purpose="logo" url={settings.chainLogoUrl} save={save} disabled={!canEdit}
        hint="Le site est sur fond sombre : utilisez une version claire du logo, en PNG à fond transparent, au moins 400 px de large (JPG, PNG ou WebP, 8 Mo maximum)." />
    </section>
  );
}

// ── Accueil : mise en page et bannière ─────────────────────────────────────
const BANNER = ['bannerEnabled', 'bannerTitle', 'bannerText', 'bannerCtaLabel', 'bannerCtaUrl', 'homeLayout'];
const LAYOUTS = [
  ['CLASSIC', 'Classique', "Accroche, recherche guidée par usage et budget, puis les derniers arrivages."],
  ['SHOWCASE', 'Vitrine', "Les ordinateurs pour lesquels « Mettre en avant » est coché (2 à 4), chacun avec sa photo, son texte et ses caractéristiques clés."],
];

export function HomePanel({ settings, canEdit, onChange }) {
  const reloadPublic = useReloadSettings();
  const pick = (s) => Object.fromEntries(BANNER.map((k) => [k, s[k] ?? (k === 'bannerEnabled' ? false : '')]));
  const [form, setForm] = useState(pick(settings));
  const [state, setState] = useState({});
  const { data: showcase } = useApi('/public/showcase');
  const featured = showcase?.items.length ?? null;
  const errs = fieldErrors(state.error);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setState({}); };

  async function submit(e) {
    e.preventDefault();
    setState({});
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && k !== 'homeLayout' ? v.trim() || null : v]));
    try { await api('/admin/settings', { method: 'PATCH', body }); setState({ ok: true }); onChange(); reloadPublic(); } catch (error) { setState({ error }); }
  }
  async function saveImage(image) {
    await api('/admin/settings/branding/banner-image', { method: 'PUT', body: { image } });
    onChange(); reloadPublic();
  }

  return (
    <section className="panel p-5 flex flex-col gap-5">
      <div><h2 className="text-lg">Page d'accueil</h2><p className="muted m-0 text-sm mt-1">Mise en page et bannière affichées en haut de l'accueil.</p></div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {state.ok && <Notice kind="success">Enregistré. Le site est à jour.</Notice>}
        {state.error && !state.error.details && <Notice kind="error">{state.error.message}</Notice>}
        <fieldset disabled={!canEdit} className="border-0 p-0 m-0 flex flex-col gap-2.5">
          <legend className="label p-0 mb-2.5">Mise en page</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {LAYOUTS.map(([value, label, text]) => (
              <label key={value} className={`flex gap-3 items-start p-4 rounded-lg border cursor-pointer ${form.homeLayout === value ? 'border-[#176BFF] bg-[#F3F7FF]' : 'border-[#DDE3EC] bg-white'}`}>
                <input type="radio" name="homeLayout" value={value} checked={form.homeLayout === value} onChange={set('homeLayout')} className="mt-1 size-4 accent-[#176BFF]" />
                <span className="flex flex-col gap-1"><span className="font-semibold">{label}</span><span className="text-[13px] muted">{text}</span></span>
              </label>
            ))}
          </div>
          {form.homeLayout === 'SHOWCASE' && featured !== null && featured < 2 && (
            <Notice kind="warning">
              {featured === 0 ? 'Aucun produit en ligne n’est mis en avant.' : 'Un seul produit en ligne est mis en avant.'} Tant qu'il y en a moins de 2, l'accueil reste en mise en page classique. Cochez « Mettre en avant » dans la fiche de 2 à 4 produits.
            </Notice>
          )}
          {form.homeLayout === 'SHOWCASE' && featured >= 2 && <span className="text-[13px] muted">{featured} produits mis en avant seront présentés.</span>}
        </fieldset>

        <fieldset disabled={!canEdit} className="border-0 border-t border-[#EEF1F5] pt-5 m-0 p-0 grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Bannière</legend>
          <label className="flex items-start gap-2.5 text-[15px] sm:col-span-2">
            <input type="checkbox" className="mt-1 size-4 accent-[#176BFF]" checked={form.bannerEnabled} onChange={set('bannerEnabled')} />
            <span><span className="font-semibold">Afficher la bannière</span><span className="block muted text-[13px]">Une annonce en haut de l'accueil : arrivage, offre, rentrée, horaires exceptionnels.</span></span>
          </label>
          <div className="sm:col-span-2">
            <Field label="Titre" error={errs.bannerTitle} hint="Un message concret, ex. « Portables 16 Go à partir de 250 000 FCFA ».">
              <input className="field" value={form.bannerTitle} maxLength={120} onChange={set('bannerTitle')} aria-invalid={!!errs.bannerTitle} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Texte (facultatif)" error={errs.bannerText} hint="Deux lignes au plus : durée de l'offre, conditions.">
              <textarea className="field !min-h-20 !py-2.5" value={form.bannerText} maxLength={400} onChange={set('bannerText')} />
            </Field>
          </div>
          <Field label="Texte du bouton (facultatif)" error={errs.bannerCtaLabel}>
            <input className="field" value={form.bannerCtaLabel} maxLength={40} placeholder="Ex. Voir les portables" onChange={set('bannerCtaLabel')} aria-invalid={!!errs.bannerCtaLabel} />
          </Field>
          <Field label="Lien du bouton" error={errs.bannerCtaUrl} hint="Une page du site (/catalogue?ram=16) ou une adresse https.">
            <input className="field" value={form.bannerCtaUrl} maxLength={300} placeholder="/catalogue" onChange={set('bannerCtaUrl')} aria-invalid={!!errs.bannerCtaUrl} />
          </Field>
        </fieldset>
        {canEdit && <button type="submit" className="btn btn-primary self-start">Enregistrer l'accueil</button>}
      </form>
      <div className="border-t border-[#EEF1F5] pt-5">
        <ImagePicker wide label="Image de la bannière (facultative)" purpose="banner" url={settings.bannerImageUrl} save={saveImage} disabled={!canEdit}
          hint="Photo réelle de vos produits ou de la boutique, format paysage (1600 × 600 px conseillé). Enregistrée aussitôt choisie." />
      </div>
    </section>
  );
}

// ── Boutiques et emplacements ──────────────────────────────────────────────
function LocationRow({ loc, canContent, canBrand, canStores, onSaved, onDelete }) {
  const reloadPublic = useReloadSettings();
  const pick = (l) => ({ name: l.name, city: l.city ?? '', address: l.address ?? '', phone: l.phone ?? '', openingHours: l.openingHours ?? '' });
  const [form, setForm] = useState(pick(loc));
  const [state, setState] = useState({});
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setState({}); };
  async function save(e) {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, k === 'name' ? v : v.trim() || null]));
    try { await api(`/admin/settings/locations/${loc.id}`, { method: 'PATCH', body }); setState({ ok: true }); onSaved(); reloadPublic(); }
    catch (error) { setState({ error }); }
  }
  async function setActive(isActive) {
    try { await api(`/admin/settings/locations/${loc.id}`, { method: 'PATCH', body: { isActive } }); onSaved(); reloadPublic(); }
    catch (error) { setState({ error }); }
  }
  async function saveLogo(image) {
    await api(`/admin/settings/locations/${loc.id}/logo`, { method: 'PUT', body: { image } });
    onSaved(); reloadPublic();
  }
  const errs = fieldErrors(state.error);
  const kind = loc.type === 'WAREHOUSE' ? 'Entrepôt' : 'Boutique';
  return (
    <div className="border-t border-[#EEF1F5] pt-4 flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-base">{loc.name}</h3>
        <span className="text-[13px] muted">{kind}, code {loc.code}</span>
        {!loc.isActive && <span className="text-[12px] font-semibold text-[#8A5A00] bg-[#FFF8E6] border border-[#F2D28C] rounded px-2 py-0.5">Désactivée</span>}
      </div>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-6 items-end">
        <fieldset disabled={!canContent} className="contents">
          <div className="sm:col-span-2"><Field label="Nom" error={errs.name}><input className="field" value={form.name} onChange={set('name')} /></Field></div>
          <div className="sm:col-span-2"><Field label="Ville" error={errs.city}><input className="field" value={form.city} onChange={set('city')} /></Field></div>
          <div className="sm:col-span-2"><Field label="Téléphone de la boutique" error={errs.phone}><input className="field" type="tel" value={form.phone} placeholder="+229 …" onChange={set('phone')} /></Field></div>
          <div className="sm:col-span-3"><Field label="Adresse affichée sur le site" error={errs.address}><input className="field" value={form.address} placeholder="Quartier, rue, repère" onChange={set('address')} /></Field></div>
          <div className="sm:col-span-3"><Field label="Horaires de la boutique" error={errs.openingHours} hint="Laisser vide pour utiliser les horaires généraux."><input className="field" value={form.openingHours} placeholder="Ex. Lundi au samedi, 9 h à 19 h" onChange={set('openingHours')} /></Field></div>
        </fieldset>
        <div className="sm:col-span-6 flex items-center gap-3 flex-wrap">
          {canContent && <button type="submit" className="btn btn-ghost">Enregistrer la boutique</button>}
          {canStores && (loc.isActive
            ? <button type="button" className="btn btn-ghost" onClick={() => setActive(false)}>Désactiver</button>
            : <button type="button" className="btn btn-ghost" onClick={() => setActive(true)}>Réactiver</button>)}
          {canStores && <button type="button" className="btn btn-danger" onClick={() => onDelete(loc)}>Supprimer</button>}
          {state.ok && <span className="text-[13px] muted">Enregistré.</span>}
          {state.error && !state.error.details && <span className="text-[13px] text-[#B42318]">{state.error.message}</span>}
        </div>
      </form>
      {loc.type === 'STORE' && (
        <ImagePicker label="Logo de la boutique (facultatif)" purpose="logo" url={loc.logoUrl} save={saveLogo} disabled={!canBrand}
          hint="Affiché sur la fiche de la boutique (page Contact et accueil). Sans logo propre, le logo de la chaîne s'applique." />
      )}
    </div>
  );
}

const NEW_STORE = { name: '', code: '', type: 'STORE', city: '', address: '', phone: '', openingHours: '' };
// Code interne proposé à partir du nom : « Porto-Novo » -> PORTO_NOVO.
const codeFrom = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);

function NewStoreForm({ onCreated, onCancel }) {
  const reloadPublic = useReloadSettings();
  const [form, setForm] = useState(NEW_STORE);
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState(null);
  const errs = fieldErrors(error);
  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v, ...(k === 'name' && !codeTouched ? { code: codeFrom(v) } : {}) }));
  };
  async function submit(e) {
    e.preventDefault();
    setError(null);
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, ['name', 'code', 'type'].includes(k) ? v : v.trim() || null]));
    try { await api('/admin/settings/locations', { method: 'POST', body }); onCreated(); reloadPublic(); } catch (err) { setError(err); }
  }
  return (
    <form onSubmit={submit} className="border border-[#176BFF] rounded-lg p-4 grid gap-3 sm:grid-cols-6 items-end bg-[#FAFCFF]">
      <h3 className="text-base sm:col-span-6">Nouvel emplacement</h3>
      {error && !error.details && <div className="sm:col-span-6"><Notice kind="error">{error.message}</Notice></div>}
      <div className="sm:col-span-2"><Field label="Nom" error={errs.name}><input className="field" value={form.name} required placeholder="Ex. Kira Tech Porto-Novo" onChange={set('name')} /></Field></div>
      <div className="sm:col-span-2"><Field label="Code interne" error={errs.code} hint="Lettres, chiffres et _ ; non modifiable ensuite."><input className="field num" value={form.code} required onChange={(e) => { setCodeTouched(true); set('code')(e); }} /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Type">
          <select className="field" value={form.type} onChange={set('type')}><option value="STORE">Boutique (vend, visible sur le site)</option><option value="WAREHOUSE">Entrepôt (stock seulement)</option></select>
        </Field>
      </div>
      <div className="sm:col-span-2"><Field label="Ville" error={errs.city}><input className="field" value={form.city} onChange={set('city')} /></Field></div>
      <div className="sm:col-span-2"><Field label="Téléphone" error={errs.phone}><input className="field" type="tel" value={form.phone} onChange={set('phone')} /></Field></div>
      <div className="sm:col-span-2"><Field label="Horaires" error={errs.openingHours}><input className="field" value={form.openingHours} onChange={set('openingHours')} /></Field></div>
      <div className="sm:col-span-6"><Field label="Adresse" error={errs.address}><input className="field" value={form.address} onChange={set('address')} /></Field></div>
      <div className="sm:col-span-6 flex gap-2"><button type="submit" className="btn btn-primary">Créer l'emplacement</button><button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button></div>
    </form>
  );
}

export function StoresPanel({ locations, canContent, canBrand, canStores, onChange }) {
  const reloadPublic = useReloadSettings();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [state, setState] = useState({});
  const stores = locations.filter((l) => l.type !== 'TRANSIT');
  async function remove() {
    setState({ busy: true });
    try {
      await api(`/admin/settings/locations/${toDelete.id}`, { method: 'DELETE' });
      setState({ ok: `${toDelete.name} supprimée.` }); onChange(); reloadPublic();
    } catch (error) { setState({ error }); }
    setToDelete(null);
  }
  return (
    <section className="panel p-5 flex flex-col gap-4">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div><h2 className="text-lg">Boutiques et emplacements</h2><p className="muted m-0 text-sm mt-1">Les boutiques actives apparaissent sur le site avec leur adresse, leur téléphone, leurs horaires et leur logo.</p></div>
        {canStores && !adding && <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Ajouter une boutique</button>}
      </div>
      {state.ok && <Notice kind="success">{state.ok}</Notice>}
      {state.error && <Notice kind="error">{state.error.message}</Notice>}
      {adding && <NewStoreForm onCreated={() => { setAdding(false); onChange(); }} onCancel={() => setAdding(false)} />}
      {stores.map((l) => (
        <LocationRow key={l.id + (l.logoUrl ?? '') + l.isActive} loc={l} canContent={canContent} canBrand={canBrand} canStores={canStores} onSaved={onChange}
          onDelete={(loc) => { setState({}); setToDelete(loc); }} />
      ))}
      <ConfirmDialog open={!!toDelete} title={`Supprimer « ${toDelete?.name} » ?`} confirmLabel="Supprimer définitivement" busy={state.busy}
        onCancel={() => setToDelete(null)} onConfirm={remove}>
        Possible seulement pour un emplacement sans stock ni historique. Si la boutique a déjà servi (ventes, mouvements, achats), elle sera refusée : désactivez-la plutôt, l'historique reste consultable.
      </ConfirmDialog>
    </section>
  );
}

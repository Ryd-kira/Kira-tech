import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { ConfirmDialog, Field, fieldErrors, Notice, PageHeader } from '../ui.jsx';
import { BrandingPanel, HomePanel, StoresPanel } from './SettingsBranding.jsx';

const CONTENT = ['companyName', 'phone', 'email', 'openingHours', 'facebookUrl', 'instagramUrl', 'tiktokUrl'];
const TEXTS = ['aboutText', 'servicesIntro'];
const SENSITIVE = ['whatsappNumber', 'publicStockDisplay', 'reservationDefaultHours', 'allowBackorder', 'maxDiscountPercentAdmin', 'maxDiscountPercentManager'];

function useSection(initial, keys) {
  const [form, setForm] = useState(null);
  useEffect(() => { if (initial) setForm(Object.fromEntries(keys.map((k) => [k, initial[k] ?? '']))); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  return [form, setForm];
}

function Section({ title, subtitle, children, onSubmit, state, disabled, single }) {
  return (
    <form onSubmit={onSubmit} className="panel p-5 flex flex-col gap-4">
      <div><h2 className="text-lg">{title}</h2>{subtitle && <p className="muted m-0 text-sm mt-1">{subtitle}</p>}</div>
      {state.ok && <Notice kind="success">Enregistré.</Notice>}
      {state.error && !state.error.details && <Notice kind="error">{state.error.message}</Notice>}
      <fieldset disabled={disabled} className={`border-0 p-0 m-0 grid gap-4 ${single ? '' : 'sm:grid-cols-2'}`}>{children}</fieldset>
      {!disabled && <button type="submit" className="btn btn-primary self-start">Enregistrer</button>}
    </form>
  );
}

const ICONS = [['WRENCH', 'Clé (réparation)'], ['CPU', 'Processeur (maintenance)'], ['SEARCH', 'Loupe (diagnostic)'], ['CHAT', 'Bulle (conseil)'], ['PHONE', 'Téléphone (assistance)']];

function ServiceRow({ service, onSaved, onDelete }) {
  const [form, setForm] = useState({ title: service.title, description: service.description, icon: service.icon, sortOrder: service.sortOrder, isActive: service.isActive });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);
  const errs = fieldErrors(error);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setOk(false); };
  async function save(e) {
    e.preventDefault();
    setError(null); setOk(false);
    try {
      await api(`/admin/settings/services/${service.id}`, { method: 'PATCH', body: { ...form, sortOrder: Number(form.sortOrder) || 0 } });
      setOk(true); onSaved();
    } catch (err) { setError(err); }
  }
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-[2fr_1fr_90px] items-end border-t border-[#EEF1F5] pt-4">
      <Field label="Intitulé" error={errs.title}><input className="field" value={form.title} maxLength={120} onChange={set('title')} /></Field>
      <Field label="Icône">
        <select className="field" value={form.icon} onChange={set('icon')}>{ICONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </Field>
      <Field label="Ordre" error={errs.sortOrder}><input className="field num" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} /></Field>
      <div className="sm:col-span-3">
        <Field label="Description" error={errs.description} hint="Prestations, délais indicatifs, conditions.">
          <textarea className="field !min-h-24 !py-2.5" value={form.description} maxLength={1000} onChange={set('description')} />
        </Field>
      </div>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 min-h-11 text-[15px]"><input type="checkbox" className="size-4 accent-[#176BFF]" checked={form.isActive} onChange={(e) => { setForm({ ...form, isActive: e.target.checked }); setOk(false); }} />Visible sur le site</label>
        <button type="submit" className="btn btn-primary">Enregistrer</button>
        <button type="button" className="btn btn-danger" onClick={() => onDelete(service)}>Supprimer</button>
        {ok && <span className="text-[13px] muted">Enregistré.</span>}
        {error && !error.details && <span className="text-[13px] text-[#B42318]">{error.message}</span>}
      </div>
    </form>
  );
}

function ServicesPanel({ services, onChange }) {
  const [form, setForm] = useState({ title: '', description: '' });
  const [error, setError] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const errs = fieldErrors(error);
  async function create(e) {
    e.preventDefault();
    setError(null);
    const sortOrder = services.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1;
    try { await api('/admin/settings/services', { method: 'POST', body: { ...form, sortOrder } }); setForm({ title: '', description: '' }); onChange(); }
    catch (err) { setError(err); }
  }
  async function remove() {
    setBusy(true);
    try { await api(`/admin/settings/services/${toDelete.id}`, { method: 'DELETE' }); onChange(); } catch (err) { setError(err); }
    setBusy(false); setToDelete(null);
  }
  return (
    <section className="panel p-5 flex flex-col gap-4">
      <div><h2 className="text-lg">Prestations</h2><p className="muted m-0 text-sm mt-1">Affichées sur l'accueil et la page Maintenance et réparation, dans l'ordre indiqué.</p></div>
      {services.length === 0 && <p className="m-0 text-[15px] muted">Aucune prestation : le site affiche un texte d'attente tant que la liste est vide.</p>}
      {services.map((s) => <ServiceRow key={s.id + s.updatedAt} service={s} onSaved={onChange} onDelete={setToDelete} />)}
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-end border-t border-[#EEF1F5] pt-4">
        <Field label="Nouvelle prestation" error={errs.title}><input className="field" value={form.title} maxLength={120} required onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. Remplacement d'écran" /></Field>
        <Field label="Description" error={errs.description}><input className="field" value={form.description} maxLength={1000} required onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <button type="submit" className="btn btn-primary">Ajouter la prestation</button>
      </form>
      {error && !error.details && <Notice kind="error">{error.message}</Notice>}
      <ConfirmDialog open={!!toDelete} title={`Supprimer la prestation « ${toDelete?.title} » ?`} confirmLabel="Supprimer la prestation" busy={busy}
        onCancel={() => setToDelete(null)} onConfirm={remove}>
        Elle disparaît du site. Pour la masquer sans la perdre, décochez « Visible sur le site ».
      </ConfirmDialog>
    </section>
  );
}

export default function Settings() {
  const { data, retry } = useApi('/admin/settings');
  const [content, setContent] = useSection(data?.settings, CONTENT);
  const [texts, setTexts] = useSection(data?.settings, TEXTS);
  const [tState, setTState] = useState({});
  const [sensitive, setSensitive] = useSection(data?.settings, SENSITIVE);
  const [cState, setCState] = useState({});
  const [sState, setSState] = useState({});
  if (!data || !content || !texts || !sensitive) return <p className="muted">Chargement…</p>;
  const canSensitive = data.canEditSensitive;
  const canContent = data.canEditContent;

  const submit = (form, setState, numeric = []) => async (e) => {
    e.preventDefault();
    setState({});
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, numeric.includes(k) ? Number(v) : v === '' ? null : v]));
    try { await api('/admin/settings', { method: 'PATCH', body }); setState({ ok: true }); retry(); } catch (error) { setState({ error }); }
  };
  const ce = fieldErrors(cState.error);
  const se = fieldErrors(sState.error);
  const te = fieldErrors(tState.error);
  const txt = (form, setForm, errs, k, label, props = {}) => (
    <Field label={label} error={errs[k]} hint={props.hint}>
      <input className="field" value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-invalid={!!errs[k]} {...props} hint={undefined} />
    </Field>
  );

  return (
    <div className="max-w-[900px] flex flex-col gap-5">
      <PageHeader title="Paramètres" subtitle="Logo, accueil, coordonnées, boutiques, textes et prestations affichés sur le site, et règles commerciales. Les produits, leurs photos et leurs prix se gèrent dans Produits." />
      <BrandingPanel settings={data.settings} canEdit={data.canEditBranding} onChange={retry} />

      <HomePanel settings={data.settings} canEdit={canContent} onChange={retry} />

      <Section title="Coordonnées" subtitle="Affichées dans le pied de page et la page contact." onSubmit={submit(content, setCState)} state={cState} disabled={!canContent}>
        {txt(content, setContent, ce, 'companyName', "Nom de l'entreprise")}
        {txt(content, setContent, ce, 'phone', 'Téléphone', { type: 'tel', placeholder: '+229 …' })}
        {txt(content, setContent, ce, 'email', 'E-mail', { type: 'email' })}
        {txt(content, setContent, ce, 'openingHours', 'Horaires généraux', { placeholder: 'Ex. Lundi au samedi, 8 h 30 à 19 h', hint: "Utilisés pour chaque boutique sans horaires propres." })}
        {txt(content, setContent, ce, 'facebookUrl', 'Page Facebook', { type: 'url', placeholder: 'https://…' })}
        {txt(content, setContent, ce, 'instagramUrl', 'Instagram', { type: 'url', placeholder: 'https://…' })}
        {txt(content, setContent, ce, 'tiktokUrl', 'TikTok', { type: 'url', placeholder: 'https://…' })}
      </Section>

      <StoresPanel locations={data.locations} canContent={canContent} canBrand={data.canEditBranding} canStores={data.canManageStores} onChange={retry} />

      <Section single title="Textes du site" subtitle="Rédigés par l'entreprise. Laissez une ligne vide entre deux paragraphes." onSubmit={submit(texts, setTState)} state={tState} disabled={!canContent}>
        <Field label="Présentation (page À propos)" error={te.aboutText} hint="Histoire, équipe, engagements, garanties.">
          <textarea className="field !min-h-[180px] !py-2.5" maxLength={6000} value={texts.aboutText ?? ''} onChange={(e) => setTexts({ ...texts, aboutText: e.target.value })} />
        </Field>
        <Field label="Introduction des prestations" error={te.servicesIntro} hint="Affichée au-dessus de la liste des prestations.">
          <textarea className="field !min-h-20 !py-2.5" maxLength={600} value={texts.servicesIntro ?? ''} onChange={(e) => setTexts({ ...texts, servicesIntro: e.target.value })} />
        </Field>
      </Section>

      {canContent && <ServicesPanel services={data.services} onChange={retry} />}

      <Section title="Règles commerciales" subtitle={canSensitive ? 'Réservées au super administrateur.' : 'Consultables seulement : réservées au super administrateur.'}
        onSubmit={submit(sensitive, setSState, ['reservationDefaultHours', 'maxDiscountPercentAdmin', 'maxDiscountPercentManager'])} state={sState} disabled={!canSensitive}>
        {txt(sensitive, setSensitive, se, 'whatsappNumber', 'Numéro WhatsApp', { type: 'tel', placeholder: '+229XXXXXXXXXX', hint: 'Format international, sans espace. Utilisé par tous les boutons WhatsApp.' })}
        <Field label="Disponibilité affichée sur le site">
          <select className="field" value={sensitive.publicStockDisplay} onChange={(e) => setSensitive({ ...sensitive, publicStockDisplay: e.target.value })}>
            <option value="LABEL_ONLY">Libellé seul (Disponible, Stock faible…)</option><option value="LABEL_AND_QUANTITY">Libellé et quantité disponible</option>
          </select>
        </Field>
        {txt(sensitive, setSensitive, se, 'reservationDefaultHours', 'Durée des réservations (heures)', { inputMode: 'numeric' })}
        {txt(sensitive, setSensitive, se, 'maxDiscountPercentAdmin', 'Remise maximale ADMIN (%)', { inputMode: 'numeric' })}
        {txt(sensitive, setSensitive, se, 'maxDiscountPercentManager', 'Remise maximale GESTIONNAIRE (%)', { inputMode: 'numeric' })}
        <label className="flex items-start gap-2.5 text-[15px] sm:col-span-2">
          <input type="checkbox" className="mt-1 size-4 accent-[#176BFF]" checked={!!sensitive.allowBackorder} onChange={(e) => setSensitive({ ...sensitive, allowBackorder: e.target.checked })} />
          <span>Autoriser la vente au-delà du stock<span className="block muted text-[13px]">La quantité manquante est enregistrée « en attente d'approvisionnement ».</span></span>
        </label>
      </Section>
    </div>
  );
}

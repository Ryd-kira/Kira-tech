import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../lib/api.js';
import { formatFCFA } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { CHANNEL, CONDITION, FUL_STATUS, PAY_COLORS, PAY_STATUS, RES_STATUS, RETURN_REASON, SALE_STATUS, usePaymentMethods } from '../commerce.jsx';
import { dateOnly, dateTime, post, useIdempotencyKey } from '../pickers.jsx';
import { ConfirmDialog, Field, fieldErrors, Notice, PageHeader, Pager } from '../ui.jsx';

// ── Paiements (rubrique « Paiements » et « Transactions ») ──────────────────
export function Payments() {
  const { can } = useAuth();
  const methods = usePaymentMethods();
  const [f, setF] = useState({ methodCode: '', from: '', to: '', page: 1 });
  const qs = new URLSearchParams({ limit: '50', page: String(f.page), ...(f.methodCode ? { methodCode: f.methodCode } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: `${f.to}T23:59:59` } : {}) });
  const { data, retry } = useApi(`/admin/payments?${qs}`);
  const [key, renewKey] = useIdempotencyKey();
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  return (
    <div className="max-w-[1100px] flex flex-col gap-4">
      <PageHeader title="Paiements" subtitle={data ? `Encaissé sur la sélection : ${formatFCFA(data.totalCollected)}` : ' '} />
      <Notice>Les paiements sont déclarés par l'équipe. Une référence Mobile Money saisie n'est pas vérifiée automatiquement auprès de l'opérateur.</Notice>
      {error && <Notice kind="error">{error.message}</Notice>}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="label">Moyen<select className="field" value={f.methodCode} onChange={(e) => setF({ ...f, methodCode: e.target.value, page: 1 })}><option value="">Tous</option>{methods.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}</select></label>
        <label className="label">Du<input className="field" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, page: 1 })} /></label>
        <label className="label">Au<input className="field" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value, page: 1 })} /></label>
      </div>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Référence</th><th>Date</th><th>Pour</th><th>Moyen</th><th className="text-right">Montant</th><th>Enregistré par</th><th /></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={7} className="muted">Aucun paiement.</td></tr>}
            {data?.items.map((p) => (
              <tr key={p.id} className={p.status === 'VOIDED' ? 'opacity-60' : ''}>
                <td className="num">{p.reference}{p.status === 'VOIDED' && <div className="text-[12px] text-[#B42318]">Saisie annulée</div>}</td>
                <td className="num whitespace-nowrap">{dateTime.format(new Date(p.receivedAt))}</td>
                <td>{p.sale ? <Link to={`/admin/ventes/${p.sale.id}`}>{p.sale.number}</Link> : p.reservation ? <Link to={`/admin/reservations/${p.reservation.id}`}>{p.reservation.number}</Link> : '-'}<div className="muted text-[12px]">{p.sale?.customer?.name}</div></td>
                <td>{p.paymentMethod.label}{p.externalReference && <div className="muted text-[12px]">Réf. {p.externalReference}</div>}</td>
                <td className="num text-right whitespace-nowrap">{formatFCFA(p.amount)}{p.refunds.length > 0 && <div className="text-[12px] muted">remboursé {formatFCFA(p.refunds.reduce((a, r) => a + r.amount, 0))}</div>}</td>
                <td>{p.recordedBy.name}</td>
                <td className="text-right">{p.status === 'RECORDED' && can('payments:void') && <button type="button" className="btn btn-danger !min-h-9" onClick={() => { setReason(''); setVoiding(p); }}>Annuler la saisie</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={f.page} onPage={(page) => setF({ ...f, page })} />
      </div>
      <ConfirmDialog open={!!voiding} title={`Annuler la saisie ${voiding?.reference} ?`} confirmLabel="Annuler la saisie" onCancel={() => setVoiding(null)}
        onConfirm={async () => {
          if (reason.trim().length < 3) return;
          const p = voiding; setVoiding(null); setError(null);
          try { await post(`/admin/payments/${p.id}/void`, { reason }, key); renewKey(); retry(); } catch (err) { setError(err); }
        }}>
        <p className="m-0 mb-3">Pour une erreur de saisie uniquement (montant ou moyen erroné). Pour rendre de l'argent à un client, utilisez « Rembourser » sur la fiche vente. La ligne reste visible.</p>
        <Field label="Motif (obligatoire)"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
    </div>
  );
}

// ── Livraisons ──────────────────────────────────────────────────────────────
export function Deliveries() {
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const { data } = useApi(`/admin/fulfillments?mode=DELIVERY&limit=30&page=${page}${status === 'open' ? '&open=1' : status ? `&status=${status}` : ''}`);
  return (
    <div className="max-w-[1100px] flex flex-col gap-4">
      <PageHeader title="Livraisons" subtitle="Le statut de livraison est indépendant du paiement. Les actions se font depuis la fiche vente." />
      <label className="label max-w-[260px]">Afficher<select className="field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="open">En cours</option><option value="">Toutes</option>{Object.entries(FUL_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Livraison</th><th>Vente</th><th>Destinataire</th><th>Adresse</th><th>Livreur</th><th>Prévue</th><th>Statut</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={7} className="muted">Aucune livraison.</td></tr>}
            {data?.items.map((f) => (
              <tr key={f.id}>
                <td className="num">{f.number}<div className="muted text-[12px]">{f.items.map((i) => `${i.quantity} × ${i.saleItem.productName}`).join(', ')}</div></td>
                <td><Link to={`/admin/ventes/${f.sale.id}`} className="num">{f.sale.number}</Link></td>
                <td>{f.recipientName}<div className="muted text-[12px]">{f.recipientPhone && <a href={`tel:${f.recipientPhone}`}>{f.recipientPhone}</a>}</div></td>
                <td className="text-[13px]">{f.address}, {f.district ? `${f.district}, ` : ''}{f.city}</td>
                <td>{f.courierName ?? '-'}</td>
                <td className="num">{f.scheduledAt ? dateOnly.format(new Date(f.scheduledAt)) : '-'}</td>
                <td className="font-semibold text-[13px]">{FUL_STATUS[f.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={page} onPage={setPage} />
      </div>
    </div>
  );
}

// ── Retours et remboursements ───────────────────────────────────────────────
export function Returns() {
  const [page, setPage] = useState(1);
  const { data } = useApi(`/admin/returns?limit=30&page=${page}`);
  return (
    <div className="max-w-[1100px] flex flex-col gap-4">
      <PageHeader title="Retours et remboursements" subtitle="Un retour s'enregistre depuis la fiche de la vente d'origine." />
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Retour</th><th>Date</th><th>Vente</th><th>Motif</th><th>Articles et état</th><th className="text-right">Remboursé</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={6} className="muted">Aucun retour.</td></tr>}
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td className="num">{r.number}</td>
                <td className="num">{dateTime.format(new Date(r.receivedAt))}</td>
                <td><Link to={`/admin/ventes/${r.sale.id}`} className="num">{r.sale.number}</Link><div className="muted text-[12px]">{r.sale.customer?.name}</div></td>
                <td>{RETURN_REASON[r.reason]}{r.exchangeSale && <div className="text-[12px]">Échange : <Link to={`/admin/ventes/${r.exchangeSale.id}`}>{r.exchangeSale.number}</Link></div>}</td>
                <td className="text-[13px]">{r.items.map((i) => `${i.quantity} × ${i.saleItem.productName} (${CONDITION[i.condition].toLowerCase()})`).join(', ')}</td>
                <td className="num text-right">{r.refunds.length ? formatFCFA(r.refunds.reduce((a, x) => a + x.amount, 0)) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={page} onPage={setPage} />
      </div>
    </div>
  );
}

// ── Clients ─────────────────────────────────────────────────────────────────
export function Customers() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, retry } = useApi(`/admin/customers?limit=50&page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const errs = fieldErrors(error);
  async function create(e) {
    e.preventDefault(); setError(null);
    try { await api('/admin/customers', { method: 'POST', body: form }); setForm(null); retry(); } catch (err) { setError(err); }
  }
  return (
    <div className="max-w-[1000px] flex flex-col gap-4">
      <PageHeader title="Clients" subtitle="Seules les informations utiles à la vente et à la livraison sont enregistrées."
        actions={!form && <button type="button" className="btn btn-primary" onClick={() => setForm({ name: '', phone: '', email: '', address: '', city: '', district: '' })}>Nouveau client</button>} />
      {form && (
        <form onSubmit={create} className="panel p-5 grid gap-3 sm:grid-cols-2">
          {error && !error.details && <div className="sm:col-span-2"><Notice kind="error">{error.message}</Notice></div>}
          {[['name', 'Nom'], ['phone', 'Téléphone'], ['email', 'E-mail (facultatif)'], ['city', 'Ville'], ['district', 'Quartier'], ['address', 'Adresse']].map(([k, l]) => (
            <Field key={k} label={l} error={errs[k]}><input className="field" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
          ))}
          <div className="flex gap-2"><button type="submit" className="btn btn-primary">Créer le client</button><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Annuler</button></div>
        </form>
      )}
      <form onSubmit={(e) => { e.preventDefault(); setQuery(q); setPage(1); }} className="flex gap-2 items-end">
        <label className="label flex-1 max-w-[420px]">Rechercher<input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou téléphone" /></label>
        <button type="submit" className="btn btn-ghost">Rechercher</button>
      </form>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Ville</th><th>Client depuis</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={4} className="muted">Aucun client.</td></tr>}
            {data?.items.map((c) => (
              <tr key={c.id}><td><Link to={`/admin/clients/${c.id}`} className="font-semibold">{c.name}</Link></td><td className="num"><a href={`tel:${c.phone}`}>{c.phone}</a></td><td>{[c.district, c.city].filter(Boolean).join(', ')}</td><td className="num">{dateOnly.format(new Date(c.createdAt))}</td></tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={page} onPage={setPage} />
      </div>
    </div>
  );
}

const CUSTOMER_FIELDS = [['name', 'Nom'], ['phone', 'Téléphone'], ['email', 'E-mail (facultatif)'], ['city', 'Ville'], ['district', 'Quartier'], ['address', 'Adresse'], ['notes', 'Notes internes']];

function CustomerEdit({ customer, onSaved, onCancel }) {
  const [form, setForm] = useState(Object.fromEntries(CUSTOMER_FIELDS.map(([k]) => [k, customer[k] ?? ''])));
  const [error, setError] = useState(null);
  const errs = fieldErrors(error);
  async function submit(e) {
    e.preventDefault(); setError(null);
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, ['name', 'phone'].includes(k) ? v : v.trim() || null]));
    try { await api(`/admin/customers/${customer.id}`, { method: 'PATCH', body }); onSaved(); } catch (err) { setError(err); }
  }
  return (
    <form onSubmit={submit} className="panel p-5 grid gap-3 sm:grid-cols-2">
      <h2 className="text-lg sm:col-span-2">Modifier les informations</h2>
      {error && !error.details && <div className="sm:col-span-2"><Notice kind="error">{error.message}</Notice></div>}
      {CUSTOMER_FIELDS.map(([k, l]) => (
        <div key={k} className={k === 'notes' || k === 'address' ? 'sm:col-span-2' : ''}>
          <Field label={l} error={errs[k]}><input className="field" value={form[k]} type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-invalid={!!errs[k]} /></Field>
        </div>
      ))}
      <div className="flex gap-2"><button type="submit" className="btn btn-primary">Enregistrer</button><button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button></div>
    </form>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: c, error, retry } = useApi(`/admin/customers/${id}`);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'delete' | 'anonymize'
  const [action, setAction] = useState({});
  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!c) return <p className="muted">Chargement…</p>;
  const bal = (sid) => c.balances.find((b) => b.saleId === sid);
  const hasHistory = c.sales.length > 0 || c.reservations.length > 0;
  async function run() {
    setAction({ busy: true });
    try {
      if (confirm === 'delete') { await api(`/admin/customers/${c.id}`, { method: 'DELETE' }); navigate('/admin/clients'); return; }
      await api(`/admin/customers/${c.id}/anonymize`, { method: 'POST' });
      setAction({ ok: 'Client anonymisé : ses coordonnées sont effacées, ses achats restent dans l’historique.' }); retry();
    } catch (err) { setAction({ error: err }); }
    setConfirm(null);
  }
  return (
    <div className="max-w-[1000px] flex flex-col gap-4">
      <PageHeader title={c.name} subtitle={`${c.phone}${c.email ? `, ${c.email}` : ''}${c.city ? `, ${[c.district, c.city].filter(Boolean).join(', ')}` : ''}`}
        actions={!editing && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>Modifier</button>
            {can('customers:delete') && (hasHistory
              ? <button type="button" className="btn btn-danger" onClick={() => setConfirm('anonymize')}>Anonymiser</button>
              : <button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}>Supprimer</button>)}
          </>
        )} />
      {action.ok && <Notice kind="success">{action.ok}</Notice>}
      {action.error && <Notice kind="error">{action.error.message}</Notice>}
      {editing && <CustomerEdit customer={c} onSaved={() => { setEditing(false); retry(); }} onCancel={() => setEditing(false)} />}
      <ConfirmDialog open={!!confirm} busy={action.busy}
        title={confirm === 'delete' ? `Supprimer le client « ${c.name} » ?` : `Anonymiser le client « ${c.name} » ?`}
        confirmLabel={confirm === 'delete' ? 'Supprimer le client' : 'Anonymiser le client'}
        onCancel={() => setConfirm(null)} onConfirm={run}>
        {confirm === 'delete'
          ? 'Le client n’a ni achat ni réservation : sa fiche est supprimée définitivement.'
          : 'Ce client a un historique d’achats. Son nom, son téléphone, son e-mail, son adresse et ses notes sont effacés définitivement ; les ventes et paiements restent enregistrés. Utile quand un client demande la suppression de ses données.'}
      </ConfirmDialog>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5"><div className="num text-[28px] font-bold" style={{ fontStretch: '112%' }}>{c.sales.filter((s) => s.status === 'VALIDATED').length}</div><div className="muted text-sm">Achats</div></div>
        <div className="panel p-5"><div className="num text-[28px] font-bold" style={{ fontStretch: '112%' }}>{formatFCFA(c.balances.reduce((a, b) => a + b.collected - b.refunded, 0))}</div><div className="muted text-sm">Payé (net des remboursements)</div></div>
        <div className="panel p-5"><div className="num text-[28px] font-bold" style={{ fontStretch: '112%', color: c.receivable ? '#B42318' : undefined }}>{formatFCFA(c.receivable)}</div><div className="muted text-sm">Reste dû (créance)</div></div>
      </div>
      <section className="panel overflow-x-auto">
        <h2 className="text-lg px-5 pt-4">Achats</h2>
        <table className="data">
          <thead><tr><th>Vente</th><th>Date</th><th>Articles</th><th>Canal</th><th className="text-right">Total</th><th>Paiement</th><th>Retours</th></tr></thead>
          <tbody>
            {c.sales.length === 0 && <tr><td colSpan={7} className="muted">Aucun achat.</td></tr>}
            {c.sales.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/admin/ventes/${s.id}`} className="num">{s.number}</Link>{s.status === 'CANCELLED' && <div className="text-[12px] text-[#B42318]">{SALE_STATUS.CANCELLED}</div>}</td>
                <td className="num">{dateOnly.format(new Date(s.validatedAt))}</td>
                <td className="text-[13px]">{s.items.map((i) => `${i.quantity} × ${i.productName}`).join(', ')}</td>
                <td>{CHANNEL[s.channel]}</td>
                <td className="num text-right">{formatFCFA(s.total)}</td>
                <td className="text-[13px] font-semibold" style={{ color: PAY_COLORS[bal(s.id)?.paymentStatus] }}>{PAY_STATUS[bal(s.id)?.paymentStatus]}</td>
                <td className="text-[13px]">{s.returns.length ? s.returns.map((r) => r.number).join(', ') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {c.reservations.length > 0 && (
        <section className="panel p-5">
          <h2 className="text-lg mb-2">Réservations</h2>
          <ul className="m-0 pl-5 text-sm">{c.reservations.map((r) => <li key={r.id}><Link to={`/admin/reservations/${r.id}`} className="num">{r.number}</Link> : {r.items.map((i) => i.product.name).join(', ')} ({RES_STATUS[r.status].toLowerCase()})</li>)}</ul>
        </section>
      )}
    </div>
  );
}

// ── Ticket de vente imprimable ──────────────────────────────────────────────
export function Ticket() {
  const { id } = useParams();
  const { data: s } = useApi(`/admin/sales/${id}`);
  const { data: settings } = useApi('/public/settings');
  if (!s) return <p className="muted">Chargement…</p>;
  return (
    <div className="max-w-[420px] mx-auto bg-white border border-[#DDE3EC] rounded-lg p-6 flex flex-col gap-3 text-[14px] print:border-0 print:max-w-none">
      <style>{'@media print { nav#admin-nav, .no-print, header { display: none !important } main { padding: 0 !important } body { background: #fff } }'}</style>
      <div className="text-center">
        <div className="font-extrabold text-lg" style={{ fontStretch: '125%' }}>KIRA TECH et Solution</div>
        <div className="muted">{s.location.name}{s.location.address ? `, ${s.location.address}` : ''}</div>
        {settings?.phone && <div className="muted">{settings.phone}</div>}
      </div>
      <div className="border-t border-dashed border-[#C9D1DD] pt-2 num">Ticket {s.number}<br />{dateTime.format(new Date(s.validatedAt))}<br />Vendeur : {s.validatedBy.name}{s.customer && <><br />Client : {s.customer.name}</>}</div>
      <table className="w-full num border-t border-dashed border-[#C9D1DD]"><tbody>
        {s.items.map((i) => (
          <tr key={i.id}><td className="py-1 pr-2">{i.quantity} × {i.productName}{i.serialNumbers.length > 0 && <div className="text-[12px] muted">n° {i.serialNumbers.map((x) => x.serialNumber).join(', ')}</div>}{i.discountAmount > 0 && <div className="text-[12px] muted">remise {formatFCFA(i.discountAmount)}</div>}</td><td className="text-right align-top">{formatFCFA(i.lineTotal)}</td></tr>
        ))}
        {s.deliveryFee > 0 && <tr><td className="py-1">Livraison</td><td className="text-right">{formatFCFA(s.deliveryFee)}</td></tr>}
      </tbody></table>
      <div className="border-t border-dashed border-[#C9D1DD] pt-2 num flex flex-col gap-0.5">
        <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatFCFA(s.total)}</span></div>
        {s.payments.filter((p) => p.status === 'RECORDED').map((p) => <div key={p.id} className="flex justify-between"><span>{p.paymentMethod.label}</span><span>{formatFCFA(p.amount)}</span></div>)}
        <div className="flex justify-between font-semibold"><span>Reste à payer</span><span>{formatFCFA(Math.max(s.balance.amountDue, 0))}</span></div>
      </div>
      <p className="m-0 text-[12px] muted text-center">Ticket de vente. Ce document n'est pas une facture normalisée.</p>
      <div className="flex gap-2 no-print"><button type="button" className="btn btn-primary flex-1" onClick={() => window.print()}>Imprimer</button><Link className="btn btn-ghost" to={`/admin/ventes/${s.id}`}>Retour</Link></div>
    </div>
  );
}

import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { whatsappUrl } from '../../lib/whatsapp.js';
import { Notice, PageHeader, Pager } from '../ui.jsx';

const LABELS = { NEW: 'Nouveau', IN_PROGRESS: 'En cours', HANDLED: 'Traité', ARCHIVED: 'Archivé' };
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Porto-Novo' });

export default function Messages() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, retry } = useApi(`/admin/messages?limit=30&page=${page}${status ? `&status=${status}` : ''}`);
  const [err, setErr] = useState(null);
  async function setTo(id, s) {
    setErr(null);
    try { await api(`/admin/messages/${id}`, { method: 'PATCH', body: { status: s } }); retry(); } catch (e) { setErr(e); }
  }
  return (
    <div className="max-w-[1000px] flex flex-col gap-4">
      <PageHeader title="Messages" subtitle={data ? `${data.unread} nouveau(x)` : ' '} />
      <label className="label max-w-[240px]">Afficher
        <select className="field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous sauf archivés</option>{Object.entries(LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {(error || err) && <Notice kind="error">{(error || err).message}</Notice>}
      {data?.items.length === 0 && <p className="muted">Aucun message.</p>}
      {data?.items.map((m) => {
        const wa = whatsappUrl(m.phone, `Bonjour ${m.name}, nous revenons vers vous au sujet de votre message « ${m.subject} ».`);
        return (
          <article key={m.id} className="panel p-5 flex flex-col gap-2">
            <div className="flex justify-between gap-3 flex-wrap items-baseline">
              <h2 className="text-lg" style={{ fontStretch: '105%' }}>{m.subject}</h2>
              <span className={`text-[13px] font-semibold ${m.status === 'NEW' ? 'text-[#0F5BE0]' : 'muted'}`}>{LABELS[m.status]}</span>
            </div>
            <div className="text-sm muted">{m.name}, <a href={`tel:${m.phone}`}>{m.phone}</a>{m.email && <>, <a href={`mailto:${m.email}`}>{m.email}</a></>}, {dateFmt.format(new Date(m.createdAt))}</div>
            {m.product && <div className="text-sm">Produit : <a href={`/produits/${m.product.slug}`} target="_blank" rel="noopener noreferrer">{m.product.name}</a></div>}
            <p className="m-0 whitespace-pre-line">{m.message}</p>
            <div className="flex gap-2 flex-wrap pt-1">
              {wa && <a className="btn btn-primary" href={wa} target="_blank" rel="noopener noreferrer">Répondre sur WhatsApp</a>}
              {m.status !== 'IN_PROGRESS' && m.status !== 'HANDLED' && <button type="button" className="btn btn-ghost" onClick={() => setTo(m.id, 'IN_PROGRESS')}>Marquer en cours</button>}
              {m.status !== 'HANDLED' && <button type="button" className="btn btn-ghost" onClick={() => setTo(m.id, 'HANDLED')}>Marquer traité</button>}
              {m.status !== 'ARCHIVED' && <button type="button" className="btn btn-ghost" onClick={() => setTo(m.id, 'ARCHIVED')}>Archiver</button>}
            </div>
          </article>
        );
      })}
      <Pager data={data} page={page} onPage={setPage} />
    </div>
  );
}

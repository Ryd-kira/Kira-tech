import { useState } from 'react';
import { Link } from 'react-router';
import { toQuery } from '../../lib/api.js';
import { formatFCFA } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import DailyRevenueChart from '../BarChart.jsx';
import { CHANNEL } from '../commerce.jsx';
import { presetRange, PRESETS } from '../period.js';
import { dateTime, MOVEMENT_LABELS } from '../pickers.jsx';
import { Notice, PageHeader } from '../ui.jsx';

function Tile({ label, value, hint, tone, to }) {
  const body = (
    <>
      <span className="text-[13px] muted font-semibold">{label}</span>
      <span className="num text-[26px] font-bold leading-tight whitespace-nowrap" style={{ fontStretch: '112%', color: tone }}>
        {typeof value === 'string' && value.endsWith(' FCFA') ? <>{value.slice(0, -5)}<span className="text-[14px] font-semibold muted ml-1">FCFA</span></> : value}
      </span>
      {hint && <span className="text-[12px] muted leading-snug">{hint}</span>}
    </>
  );
  return to
    ? <Link to={to} className="panel p-4 flex flex-col gap-1 no-underline !text-[#090D16] hover:border-[#176BFF]">{body}</Link>
    : <div className="panel p-4 flex flex-col gap-1">{body}</div>;
}

const Band = ({ title, note, children }) => (
  <section className="flex flex-col gap-3" aria-label={title}>
    <div className="flex items-baseline justify-between gap-3 flex-wrap"><h2 className="text-xl">{title}</h2>{note && <span className="text-[13px] muted">{note}</span>}</div>
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">{children}</div>
  </section>
);

export const AUDIT_LABELS = {
  'auth.login': 'Connexion', 'auth.login.failed': 'Échec de connexion', 'auth.logout': 'Déconnexion', 'auth.password.change': 'Mot de passe changé', 'auth.password.reset': 'Mot de passe réinitialisé',
  'sale.validate': 'Vente validée', 'sale.cancel': 'Vente annulée', 'payment.record': 'Paiement enregistré', 'payment.void': 'Saisie de paiement annulée', 'refund.record': 'Remboursement',
  'reservation.create': 'Réservation créée', 'reservation.confirm': 'Réservation confirmée', 'reservation.cancel': 'Réservation annulée', 'reservation.extend': 'Réservation prolongée',
  'fulfillment.create': 'Remise préparée', 'fulfillment.ready': 'Remise prête', 'fulfillment.dispatch': 'Remis au livreur', 'fulfillment.complete': 'Remise confirmée', 'fulfillment.fail': 'Échec de livraison', 'fulfillment.returnToStore': 'Retour en boutique', 'fulfillment.cancel': 'Remise annulée',
  'return.create': 'Retour enregistré', 'purchase.create': 'Achat créé', 'purchase.receive': 'Réception d’achat', 'purchase.cancel': 'Achat annulé', 'purchase.close': 'Achat clôturé',
  'transfer.create': 'Transfert créé', 'transfer.ship': 'Transfert expédié', 'transfer.receive': 'Transfert reçu', 'transfer.cancel': 'Transfert annulé',
  'user.create': 'Compte créé', 'user.update': 'Compte modifié', 'user.role.change': 'Rôle modifié', 'user.deactivate': 'Compte désactivé', 'user.reactivate': 'Compte réactivé', 'user.reset_link.issue': 'Lien de réinitialisation émis',
  'settings.update': 'Paramètres modifiés', 'location.update': 'Boutique modifiée', 'service.create': 'Prestation ajoutée', 'service.update': 'Prestation modifiée', 'service.delete': 'Prestation supprimée', 'settings.sensitive.update': 'Règles commerciales modifiées', 'report.export.sales': 'Export des ventes', 'report.export.payments': 'Export des paiements', 'report.export.stock': 'Export du stock',
};

const ACTION_LABELS = { 'product.create': 'Création', 'product.update': 'Modification', 'product.price.update': 'Changement de prix', 'product.delete': 'Suppression', 'product.image.add': 'Photo ajoutée', 'product.image.delete': 'Photo supprimée', 'product.image.reorder': 'Ordre des photos' };

export default function Overview() {
  const { user, can } = useAuth();
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(presetRange('month'));
  const [locationId, setLocationId] = useState('');
  const { data: locs } = useApi('/admin/stock/locations');
  const { data, error, loading } = useApi(`/admin/dashboard${toQuery({ ...range, locationId })}`);
  const choose = (p) => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)); };
  const c = data?.sections.commercial;
  const k = data?.sections.costs;
  const st = data?.sections.stock;

  return (
    <div className="flex flex-col gap-7 max-w-[1300px]">
      <PageHeader title="Vue générale" subtitle={`Bonjour ${user.name.split(' ')[0]}.`} />
      <div className="panel p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <span className="label">Période</span>
          <div className="flex flex-wrap gap-1.5">{PRESETS.map(([v, l]) => <button key={v} type="button" className="chip !min-h-9 !text-sm" aria-pressed={preset === v} onClick={() => choose(v)}>{l}</button>)}</div>
        </div>
        {preset === 'custom' && <>
          <label className="label">Du<input className="field" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label className="label">Au<input className="field" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        </>}
        <label className="label">Boutique<select className="field" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Toutes</option>{(locs?.items ?? []).filter((l) => l.type !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        {loading && <span className="muted text-sm" aria-live="polite">Mise à jour…</span>}
      </div>
      {error && <Notice kind="error">{error.message}</Notice>}

      {c && (
        <Band title="Ventes et trésorerie" note="Le chiffre d'affaires n'est pas un bénéfice.">
          <Tile label="Chiffre d'affaires" value={formatFCFA(c.revenue)} hint={`Ventes validées de la période${c.returnsValue ? `, moins ${formatFCFA(c.returnsValue)} de retours` : ''}`} to="/admin/ventes" />
          <Tile label="Nombre de ventes" value={c.salesCount} hint="Ventes validées, annulations exclues" />
          <Tile label="Panier moyen" value={formatFCFA(c.averageBasket)} hint="Montant moyen d'une vente" />
          <Tile label="Encaissements" value={formatFCFA(c.collected)} hint="Argent reçu sur la période, acomptes inclus" to="/admin/paiements" />
          <Tile label="Remboursements" value={formatFCFA(c.refunded)} hint="Argent rendu sur la période" />
          <Tile label="Créances clients" value={formatFCFA(c.receivables.amount)} tone={c.receivables.amount ? '#B42318' : undefined} hint={`À ce jour, ${c.receivables.count} vente(s) non soldée(s), toutes périodes`} to="/admin/ventes?paymentStatus=PARTIALLY_PAID" />
        </Band>
      )}

      {k && (
        <Band title="Marge et valeurs" note="Estimations au coût moyen pondéré, hors frais généraux.">
          <Tile label="Marge commerciale estimée" value={formatFCFA(k.margin.amount)} hint={k.margin.rate != null ? `${Math.round(k.margin.rate * 100)} % du chiffre d'affaires des articles conservés` : 'Aucune vente sur la période'} />
          <Tile label="Valeur du stock" value={formatFCFA(k.stockValue.amount)} hint="À ce jour, au coût moyen d'achat" to="/admin/stocks" />
          <Tile label="Achats de la période" value={formatFCFA(k.purchases.amount)} hint={`${k.purchases.count} achat(s), frais inclus`} to="/admin/achats" />
        </Band>
      )}
      {k && (k.margin.unknownCostLines > 0 || k.stockValue.unknownCostProducts > 0) && (
        <Notice kind="warning">
          {k.margin.unknownCostLines > 0 && `${k.margin.unknownCostLines} ligne(s) vendue(s) sans coût d'achat connu : la marge est surestimée. `}
          {k.stockValue.unknownCostProducts > 0 && `${k.stockValue.unknownCostProducts} produit(s) en stock sans coût d'achat : enregistrez leurs achats pour une valeur juste.`}
        </Notice>
      )}

      {c && <DailyRevenueChart from={data.period.from} to={data.period.to} rows={c.daily} />}

      {c && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel overflow-x-auto">
            <h2 className="text-lg px-5 pt-4">Boutique ou livraison</h2>
            <table className="data"><thead><tr><th>Canal</th><th className="text-right">Ventes</th><th className="text-right">Montant</th></tr></thead>
              <tbody>{[['inStore', 'IN_STORE'], ['delivery', 'DELIVERY']].map(([key, ch]) => <tr key={key}><td>{CHANNEL[ch]}</td><td className="num text-right">{c.channels[key].count}</td><td className="num text-right">{formatFCFA(c.channels[key].amount)}</td></tr>)}</tbody></table>
          </section>
          <section className="panel overflow-x-auto">
            <h2 className="text-lg px-5 pt-4">Par boutique</h2>
            <table className="data"><thead><tr><th>Boutique</th><th className="text-right">Ventes</th><th className="text-right">Montant</th></tr></thead>
              <tbody>{c.byLocation.length === 0 ? <tr><td colSpan={3} className="muted">Aucune vente.</td></tr> : c.byLocation.map((r) => <tr key={r.location}><td>{r.location}</td><td className="num text-right">{r.count}</td><td className="num text-right">{formatFCFA(r.amount)}</td></tr>)}</tbody></table>
          </section>
          <section className="panel overflow-x-auto">
            <h2 className="text-lg px-5 pt-4">Produits les plus vendus</h2>
            <table className="data"><thead><tr><th>Produit</th><th className="text-right">Qté</th><th className="text-right">Montant</th></tr></thead>
              <tbody>{c.topProducts.length === 0 ? <tr><td colSpan={3} className="muted">Aucune vente.</td></tr> : c.topProducts.map((r) => <tr key={r.id}><td>{r.name}</td><td className="num text-right">{r.quantity}</td><td className="num text-right">{formatFCFA(r.amount)}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}

      {st && (
        <Band title="Catalogue et stock" note="À ce jour, tous emplacements vendables.">
          <Tile label="Produits" value={st.catalog.total} hint="Hors archivés" to="/admin/produits" />
          <Tile label="Disponibles" value={st.catalog.available} tone="#0B7A47" to="/admin/stocks?status=IN_STOCK" />
          <Tile label="Stock faible" value={st.catalog.lowStock} tone={st.catalog.lowStock ? '#8A5A00' : undefined} to="/admin/stocks?status=LOW_STOCK" />
          <Tile label="En rupture" value={st.catalog.outOfStock} tone={st.catalog.outOfStock ? '#B42318' : undefined} to="/admin/stocks?status=OUT_OF_STOCK" />
          <Tile label="Désactivés manuellement" value={st.catalog.manuallyUnavailable} />
          <Tile label="Prix masqué" value={st.catalog.hiddenPrice} hint="Affichés « Prix sur demande »" />
        </Band>
      )}

      {st && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel overflow-x-auto">
            <h2 className="text-lg px-5 pt-4">À réapprovisionner</h2>
            <table className="data"><thead><tr><th>Produit</th><th className="text-right">Disponible</th><th className="text-right">Seuil</th></tr></thead>
              <tbody>{st.alerts.length === 0 ? <tr><td colSpan={3} className="muted">Aucun produit en ligne sous son seuil.</td></tr> : st.alerts.map((a) => (
                <tr key={a.id}><td><Link to={`/admin/mouvements?productId=${a.id}`}>{a.name}</Link></td><td className="num text-right font-semibold" style={{ color: a.status === 'OUT_OF_STOCK' ? '#B42318' : '#8A5A00' }}>{a.quantity}</td><td className="num text-right">{a.threshold}</td></tr>
              ))}</tbody></table>
          </section>
          <section className="panel overflow-x-auto">
            <h2 className="text-lg px-5 pt-4">Derniers mouvements de stock</h2>
            <table className="data"><tbody>{st.recentMovements.length === 0 ? <tr><td className="muted">Aucun mouvement.</td></tr> : st.recentMovements.map((m, i) => (
              <tr key={i}><td className="num whitespace-nowrap text-[13px]">{dateTime.format(new Date(m.at))}</td><td className="text-[13px]">{MOVEMENT_LABELS[m.type]} : {m.product}<div className="muted">{m.location}, {m.by}</div></td><td className={`num text-right font-semibold ${m.delta > 0 ? 'text-[#0B7A47]' : 'text-[#B42318]'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td></tr>
            ))}</tbody></table>
          </section>
          <section className="panel overflow-x-auto">
            <h2 className="text-lg px-5 pt-4">Dernières modifications du catalogue</h2>
            <table className="data"><tbody>{st.catalogChanges.length === 0 ? <tr><td className="muted">Aucune modification.</td></tr> : st.catalogChanges.map((x, i) => (
              <tr key={i}><td className="num whitespace-nowrap text-[13px]">{dateTime.format(new Date(x.at))}</td><td className="text-[13px]">{ACTION_LABELS[x.action] ?? x.action} : {x.product}<div className="muted">{x.by}</div></td></tr>
            ))}</tbody></table>
          </section>
          {data.sections.activity && (
            <section className="panel overflow-x-auto">
              <div className="flex justify-between items-baseline px-5 pt-4"><h2 className="text-lg">Activité des administrateurs</h2>{can('audit:read') && <Link to="/admin/journal" className="text-sm">Journal complet</Link>}</div>
              <table className="data"><tbody>{data.sections.activity.map((a, i) => (
                <tr key={i}><td className="num whitespace-nowrap text-[13px]">{dateTime.format(new Date(a.at))}</td><td className="text-[13px]">{AUDIT_LABELS[a.action] ?? ACTION_LABELS[a.action] ?? a.action}<div className="muted">{a.by}</div></td></tr>
              ))}</tbody></table>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

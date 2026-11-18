import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';
import { periodQuery, resolvePeriod } from '../dashboard/period.js';

/**
 * Exports CSV (séparateur « ; », UTF-8 avec BOM : s'ouvrent directement dans Excel en français).
 * Protection contre l'injection de formules : une cellule qui commence par = + - @ est préfixée d'une apostrophe.
 */
const router = Router();

export function csvCell(v) {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (header, rows) => `﻿${[header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
const send = (res, name, csv) => res.type('text/csv; charset=utf-8').attachment(name).send(csv);
const fmtDate = (d) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Porto-Novo' }).format(d);

function period(req) {
  const q = parse(z.object(periodQuery).strict(), req.query);
  try { return { ...resolvePeriod(q), locationId: q.locationId }; } catch (e) { throw new AppError(400, 'VALIDATION_ERROR', e.message); }
}

router.get('/sales.csv', requirePermission('dashboard:commercial'), async (req, res) => {
  const p = period(req);
  const sales = await prisma.sale.findMany({
    where: { validatedAt: { gte: p.start, lt: p.end }, ...(p.locationId ? { locationId: p.locationId } : {}) },
    orderBy: { validatedAt: 'asc' },
    include: { customer: { select: { name: true, phone: true } }, location: { select: { name: true } }, validatedBy: { select: { name: true } } },
  });
  const balances = sales.length ? await prisma.$queryRaw`SELECT "saleId", collected, refunded, "amountDue", "paymentStatus" FROM sale_balance WHERE "saleId" = ANY(${sales.map((s) => s.id)}::uuid[])` : [];
  const rows = sales.map((s) => {
    const b = balances.find((x) => x.saleId === s.id) ?? {};
    return [s.number, fmtDate(s.validatedAt), s.status === 'VALIDATED' ? 'Validée' : 'Annulée', s.channel === 'IN_STORE' ? 'Boutique' : 'Livraison', s.location.name,
      s.customer?.name ?? 'Occasionnel', s.customer?.phone ?? '', s.subtotal, s.discountTotal, s.deliveryFee, s.total, b.collected, b.refunded, b.amountDue, s.validatedBy.name];
  });
  await writeAudit(null, { adminUserId: req.admin.id, action: 'report.export.sales', entityType: 'Report', newValues: { from: p.from, to: p.to }, ip: req.ip });
  send(res, `ventes_${p.from}_${p.to}.csv`, toCsv(['Numéro', 'Date', 'Statut', 'Canal', 'Boutique', 'Client', 'Téléphone', 'Sous-total', 'Remises', 'Livraison', 'Total', 'Encaissé', 'Remboursé', 'Reste à payer', 'Vendeur'], rows));
});

router.get('/payments.csv', requirePermission('dashboard:commercial'), async (req, res) => {
  const p = period(req);
  const items = await prisma.payment.findMany({
    where: { receivedAt: { gte: p.start, lt: p.end } }, orderBy: { receivedAt: 'asc' },
    include: { paymentMethod: true, sale: { select: { number: true } }, reservation: { select: { number: true } }, recordedBy: { select: { name: true } } },
  });
  await writeAudit(null, { adminUserId: req.admin.id, action: 'report.export.payments', entityType: 'Report', newValues: { from: p.from, to: p.to }, ip: req.ip });
  send(res, `paiements_${p.from}_${p.to}.csv`, toCsv(['Référence', 'Date', 'Vente', 'Réservation', 'Moyen', 'Référence externe', 'Montant', 'Statut', 'Enregistré par'],
    items.map((x) => [x.reference, fmtDate(x.receivedAt), x.sale?.number, x.reservation?.number, x.paymentMethod.label, x.externalReference, x.amount, x.status === 'RECORDED' ? 'Enregistré' : 'Annulé', x.recordedBy.name])));
});

router.get('/stock.csv', requirePermission('dashboard:costs'), async (req, res) => {
  const rows = await prisma.$queryRaw`
    SELECT p.sku, p.name, l.name AS location, a.physical, a.reserved, a.allocated, a.available, a.quarantine, a.damaged, p."averageCost" AS cost,
      ROUND((a.physical + a.quarantine) * p."averageCost") AS value
    FROM stock_availability a JOIN products p ON p.id = a."productId" JOIN stock_locations l ON l.id = a."locationId"
    WHERE a.physical + a.quarantine + a.damaged > 0 ORDER BY p.name, l.name`;
  await writeAudit(null, { adminUserId: req.admin.id, action: 'report.export.stock', entityType: 'Report', ip: req.ip });
  send(res, `stock_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(['Référence', 'Produit', 'Emplacement', 'Physique', 'Réservé', 'Affecté', 'Disponible', 'Quarantaine', 'Endommagé', 'Coût moyen', 'Valeur'],
    rows.map((r) => [r.sku, r.name, r.location, r.physical, r.reserved, r.allocated, r.available, r.quarantine, r.damaged, Number(r.cost), Number(r.value)])));
});

export default router;

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { can } from '../../auth/permissions.js';
import { AppError, errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { periodQuery, resolvePeriod } from './period.js';

/**
 * Tableau de bord. Chaque indicateur a une définition unique, affichée dans l'interface :
 *  - Chiffre d'affaires : ventes validées non annulées de la période (TTC, frais de livraison inclus),
 *    moins la valeur des retours reçus sur la période. Ce n'est pas un bénéfice.
 *  - Encaissements : paiements enregistrés sur la période (acomptes inclus), saisies annulées exclues.
 *  - Remboursements : remboursements enregistrés sur la période.
 *  - Créances : à date, reste à payer de toutes les ventes validées (indépendant de la période).
 *  - Marge estimée : sur les articles vendus dans la période et non retournés,
 *    prix appliqué moins coût moyen pondéré au moment de la vente. Hors frais généraux.
 */
const router = Router();

const ANY = (perms) => (req, res, next) => (perms.some((p) => can(req.admin.role, p)) ? next() : next(errors.forbidden()));

router.get('/', ANY(['dashboard:stock', 'dashboard:commercial']), async (req, res) => {
  const q = parse(z.object(periodQuery).strict(), req.query);
  let period;
  try { period = resolvePeriod(q); } catch (e) { throw new AppError(400, 'VALIDATION_ERROR', e.message); }
  const { start, end } = period;
  const loc = q.locationId ? Prisma.sql`AND s."locationId" = ${q.locationId}::uuid` : Prisma.empty;
  const role = req.admin.role;
  const out = { period: { from: period.from, to: period.to, locationId: q.locationId ?? null }, sections: {} };

  // ── Stock et catalogue (tous les rôles du tableau de bord) ──
  const [catalog] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE s."stockStatus" = 'IN_STOCK' AND NOT p."isManuallyUnavailable")::int AS available,
      COUNT(*) FILTER (WHERE s."stockStatus" = 'LOW_STOCK' AND NOT p."isManuallyUnavailable")::int AS "lowStock",
      COUNT(*) FILTER (WHERE s."stockStatus" = 'OUT_OF_STOCK' AND NOT p."isManuallyUnavailable")::int AS "outOfStock",
      COUNT(*) FILTER (WHERE p."isManuallyUnavailable")::int AS "manuallyUnavailable",
      COUNT(*) FILTER (WHERE NOT p."showPrice")::int AS "hiddenPrice"
    FROM products p JOIN product_stock_status s ON s."productId" = p.id
    WHERE p.status <> 'ARCHIVED'`;
  const alerts = await prisma.$queryRaw`
    SELECT p.id, p.name, p.sku, s."stockQuantity" AS quantity, s."stockStatus" AS status, p."lowStockThreshold" AS threshold
    FROM products p JOIN product_stock_status s ON s."productId" = p.id
    WHERE p.status = 'PUBLISHED' AND NOT p."isManuallyUnavailable" AND s."stockStatus" IN ('LOW_STOCK', 'OUT_OF_STOCK')
    ORDER BY s."stockQuantity" ASC, p.name ASC LIMIT 15`;
  const movements = await prisma.stockMovement.findMany({
    orderBy: { createdAt: 'desc' }, take: 10,
    where: q.locationId ? { locationId: q.locationId } : {},
    include: { product: { select: { name: true } }, location: { select: { name: true } }, adminUser: { select: { name: true } } },
  });
  const catalogChanges = await prisma.auditLog.findMany({
    where: { entityType: 'Product' }, orderBy: { createdAt: 'desc' }, take: 10,
    include: { adminUser: { select: { name: true } } },
  });
  const names = new Map((await prisma.product.findMany({ where: { id: { in: catalogChanges.map((c) => c.entityId).filter(Boolean) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  out.sections.stock = {
    catalog, alerts,
    recentMovements: movements.map((m) => ({ at: m.createdAt, type: m.type, bucket: m.bucket, delta: m.quantityDelta, product: m.product.name, location: m.location.name, by: m.adminUser.name })),
    catalogChanges: catalogChanges.map((c) => ({ at: c.createdAt, action: c.action, product: names.get(c.entityId) ?? '(supprimé)', by: c.adminUser?.name })),
  };

  // ── Commercial (SUPER_ADMIN, ADMIN) ──
  if (can(role, 'dashboard:commercial')) {
    const [sales] = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(s.total), 0)::bigint AS gross,
        COALESCE(SUM(s.total) FILTER (WHERE s.channel = 'IN_STORE'), 0)::bigint AS "inStore",
        COUNT(*) FILTER (WHERE s.channel = 'IN_STORE')::int AS "inStoreCount",
        COALESCE(SUM(s.total) FILTER (WHERE s.channel = 'DELIVERY'), 0)::bigint AS delivery,
        COUNT(*) FILTER (WHERE s.channel = 'DELIVERY')::int AS "deliveryCount"
      FROM sales s WHERE s.status = 'VALIDATED' AND s."validatedAt" >= ${start} AND s."validatedAt" < ${end} ${loc}`;
    const [returned] = await prisma.$queryRaw`
      SELECT COALESCE(SUM(ri.quantity * si."lineTotal" / si.quantity), 0)::bigint AS value
      FROM return_items ri JOIN returns r ON r.id = ri."returnId" JOIN sale_items si ON si.id = ri."saleItemId" JOIN sales s ON s.id = si."saleId"
      WHERE r."receivedAt" >= ${start} AND r."receivedAt" < ${end} ${loc}`;
    const [cash] = await prisma.$queryRaw`
      SELECT
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
          LEFT JOIN sales s ON s.id = p."saleId" LEFT JOIN stock_reservations r ON r.id = p."reservationId"
          WHERE p.status = 'RECORDED' AND p."receivedAt" >= ${start} AND p."receivedAt" < ${end}
          ${q.locationId ? Prisma.sql`AND COALESCE(s."locationId", r."locationId") = ${q.locationId}::uuid` : Prisma.empty})::bigint AS collected,
        (SELECT COALESCE(SUM(f.amount), 0) FROM refunds f JOIN payments p ON p.id = f."paymentId"
          LEFT JOIN sales s ON s.id = p."saleId" LEFT JOIN stock_reservations r ON r.id = p."reservationId"
          WHERE f.status = 'RECORDED' AND f."refundedAt" >= ${start} AND f."refundedAt" < ${end}
          ${q.locationId ? Prisma.sql`AND COALESCE(s."locationId", r."locationId") = ${q.locationId}::uuid` : Prisma.empty})::bigint AS refunded`;
    const [receivables] = await prisma.$queryRaw`
      SELECT COALESCE(SUM(GREATEST(b."amountDue", 0)), 0)::bigint AS amount, COUNT(*) FILTER (WHERE b."amountDue" > 0)::int AS count
      FROM sale_balance b JOIN sales s ON s.id = b."saleId" WHERE s.status = 'VALIDATED' ${loc}`;
    const byLocation = await prisma.$queryRaw`
      SELECT l.name AS location, COUNT(s.id)::int AS count, COALESCE(SUM(s.total), 0)::bigint AS amount
      FROM sales s JOIN stock_locations l ON l.id = s."locationId"
      WHERE s.status = 'VALIDATED' AND s."validatedAt" >= ${start} AND s."validatedAt" < ${end}
      GROUP BY l.name ORDER BY amount DESC`;
    const daily = await prisma.$queryRaw`
      SELECT to_char(s."validatedAt" AT TIME ZONE 'Africa/Porto-Novo', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count, SUM(s.total)::bigint AS amount
      FROM sales s WHERE s.status = 'VALIDATED' AND s."validatedAt" >= ${start} AND s."validatedAt" < ${end} ${loc}
      GROUP BY 1 ORDER BY 1`;
    const top = await prisma.$queryRaw`
      SELECT si."productId" AS id, MAX(si."productName") AS name, SUM(si.quantity - si."quantityReturned")::int AS quantity,
        SUM(si."lineTotal" * (si.quantity - si."quantityReturned") / si.quantity)::bigint AS amount
      FROM sale_items si JOIN sales s ON s.id = si."saleId"
      WHERE s.status = 'VALIDATED' AND s."validatedAt" >= ${start} AND s."validatedAt" < ${end} ${loc}
      GROUP BY si."productId" HAVING SUM(si.quantity - si."quantityReturned") > 0 ORDER BY quantity DESC, amount DESC LIMIT 10`;
    const n = (v) => Number(v);
    const gross = n(sales.gross);
    const revenue = gross - n(returned.value);
    out.sections.commercial = {
      revenue, gross, returnsValue: n(returned.value), salesCount: sales.count,
      averageBasket: sales.count ? Math.round(gross / sales.count) : 0,
      collected: n(cash.collected), refunded: n(cash.refunded),
      receivables: { amount: n(receivables.amount), count: receivables.count },
      channels: { inStore: { amount: n(sales.inStore), count: sales.inStoreCount }, delivery: { amount: n(sales.delivery), count: sales.deliveryCount } },
      byLocation: byLocation.map((r) => ({ ...r, amount: n(r.amount) })),
      daily: daily.map((r) => ({ ...r, amount: n(r.amount) })),
      topProducts: top.map((r) => ({ ...r, amount: n(r.amount) })),
    };
  }

  // ── Coûts et marge (SUPER_ADMIN, ADMIN) ──
  if (can(role, 'dashboard:costs')) {
    const [margin] = await prisma.$queryRaw`
      SELECT COALESCE(SUM((si."lineTotal"::numeric / si.quantity - si."unitCostSnapshot") * (si.quantity - si."quantityReturned")), 0)::bigint AS amount,
        COALESCE(SUM(si."lineTotal"::numeric * (si.quantity - si."quantityReturned") / si.quantity), 0)::bigint AS base,
        COUNT(*) FILTER (WHERE si."unitCostSnapshot" = 0)::int AS "unknownCostLines"
      FROM sale_items si JOIN sales s ON s.id = si."saleId"
      WHERE s.status = 'VALIDATED' AND s."validatedAt" >= ${start} AND s."validatedAt" < ${end} ${loc}`;
    const [stockValue] = await prisma.$queryRaw`
      SELECT COALESCE(SUM((l."onHand" + l.quarantine) * p."averageCost"), 0)::bigint AS amount,
        COUNT(DISTINCT p.id) FILTER (WHERE p."averageCost" = 0 AND l."onHand" > 0)::int AS "unknownCostProducts"
      FROM stock_levels l JOIN products p ON p.id = l."productId"
      ${q.locationId ? Prisma.sql`WHERE l."locationId" = ${q.locationId}::uuid` : Prisma.empty}`;
    const [purchases] = await prisma.$queryRaw`
      SELECT COALESCE(SUM("totalAmount"), 0)::bigint AS amount, COUNT(*)::int AS count FROM purchases
      WHERE status <> 'CANCELLED' AND "purchaseDate" >= ${start} AND "purchaseDate" < ${end}
      ${q.locationId ? Prisma.sql`AND "locationId" = ${q.locationId}::uuid` : Prisma.empty}`;
    out.sections.costs = {
      margin: { amount: Number(margin.amount), rate: Number(margin.base) ? Number(margin.amount) / Number(margin.base) : null, unknownCostLines: margin.unknownCostLines },
      stockValue: { amount: Number(stockValue.amount), unknownCostProducts: stockValue.unknownCostProducts },
      purchases: { amount: Number(purchases.amount), count: purchases.count },
    };
  }

  // ── Activité des administrateurs (journal complet : SUPER_ADMIN) ──
  if (can(role, 'audit:read')) {
    out.sections.activity = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { adminUser: { select: { name: true } } } }))
      .map((a) => ({ at: a.createdAt, action: a.action, entityType: a.entityType, by: a.adminUser?.name ?? 'Système' }));
  }
  res.json(out);
});

export default router;

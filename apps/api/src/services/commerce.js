import { Prisma } from '@prisma/client';
import { discountCeiling } from '../auth/permissions.js';
import { AppError, errors } from '../lib/errors.js';
import { writeAudit } from './audit.js';
import { nextNumber } from './numbering.js';
import { applyStockChanges, lockSerials, perSerial, recordStatus, StockInsufficientError, transitLocation } from './stockLedger.js';

/**
 * Règle fondamentale (addendum 3) : réservation, validation commerciale, remise au client et
 * paiement sont des événements indépendants, chacun historisé. Rien ici ne déduit l'un de l'autre.
 *
 * Compteurs de stock par emplacement :
 *   réservation      : réservé +q
 *   conversion       : réservé -q puis affecté +q (le disponible ne bouge pas : pas de double comptage)
 *   vente directe    : affecté +q
 *   remise boutique  : affecté -q puis physique -q
 *   remise livreur   : boutique (affecté -q, physique -q), En transit (physique +q, affecté +q)
 *   livraison reçue  : En transit (affecté -q, physique -q)
 */

const ACTIVE_RESERVATION = ['PENDING', 'CONFIRMED'];
const OPEN_FULFILLMENT = ['PREPARING', 'READY', 'IN_TRANSIT', 'FAILED'];

export const settingsOf = (tx) => tx.siteSetting.findUniqueOrThrow({ where: { id: 1 } });

async function lockRow(tx, table, id, what) {
  const rows = await tx.$queryRaw`SELECT id FROM ${Prisma.raw(table)} WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw errors.notFound(what);
}

async function paymentMethod(tx, code) {
  const m = await tx.paymentMethod.findUnique({ where: { code } });
  if (!m || !m.isActive) throw new AppError(400, 'VALIDATION_ERROR', 'Moyen de paiement inconnu.', [{ field: 'methodCode', message: 'Moyen inconnu' }]);
  return m;
}

async function sellableStore(tx, locationId) {
  const loc = await tx.stockLocation.findUnique({ where: { id: locationId } });
  if (!loc || !loc.isActive || !loc.isSellable) throw new AppError(400, 'INVALID_LOCATION', 'Choisissez une boutique de vente.');
  return loc;
}

export async function resolveCustomer(tx, admin, { customerId, newCustomer }) {
  if (customerId) {
    const c = await tx.customer.findUnique({ where: { id: customerId } });
    if (!c) throw new AppError(400, 'VALIDATION_ERROR', 'Client inconnu.', [{ field: 'customerId', message: 'Client inconnu' }]);
    return c;
  }
  if (newCustomer) return tx.customer.create({ data: { ...newCustomer, createdById: admin.id } });
  return null; // client occasionnel : aucune fiche n'est imposée
}

// ── Réservations ────────────────────────────────────────────────────────────

/** Libère les réservations échues (toutes, ou celles qui concernent ces produits). */
export async function expireReservations(tx, productIds) {
  const filter = productIds?.length
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM reservation_items ri WHERE ri."reservationId" = r.id AND ri."productId" IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))}))`
    : Prisma.empty;
  const due = await tx.$queryRaw`
    SELECT r.id FROM stock_reservations r
    WHERE r.status IN ('PENDING', 'CONFIRMED') AND r."expiresAt" < now() ${filter}
    ORDER BY r.id FOR UPDATE SKIP LOCKED`;
  for (const { id } of due) {
    const r = await tx.stockReservation.findUnique({ where: { id }, include: { items: true } });
    await applyStockChanges(tx, { type: 'RESERVATION_RELEASE', adminUserId: r.createdById, reason: 'Expiration automatique', refs: { reservationId: id }, documentRef: r.number },
      r.items.map((i) => ({ productId: i.productId, locationId: r.locationId, bucket: 'RESERVED', delta: -i.quantity })));
    await tx.stockReservation.update({ where: { id }, data: { status: 'EXPIRED' } });
    await recordStatus(tx, { adminUserId: r.createdById, from: r.status, to: 'EXPIRED', reason: 'Expiration automatique', reservationId: id });
  }
  return due.length;
}

export async function createReservation(tx, admin, d, ip) {
  await sellableStore(tx, d.locationId);
  await expireReservations(tx, d.items.map((i) => i.productId));
  const customer = await resolveCustomer(tx, admin, d);
  const settings = await settingsOf(tx);
  const expiresAt = d.expiresAt ?? new Date(Date.now() + settings.reservationDefaultHours * 3600_000);
  if (expiresAt.getTime() <= Date.now()) throw new AppError(400, 'VALIDATION_ERROR', "La date d'expiration doit être dans le futur.", [{ field: 'expiresAt', message: 'Date passée' }]);

  const reservation = await tx.stockReservation.create({
    data: {
      number: await nextNumber(tx, 'RESERVATION'), customerId: customer?.id, locationId: d.locationId, expiresAt, notes: d.notes,
      createdById: admin.id, items: { create: d.items.map((i) => ({ productId: i.productId, quantity: i.quantity, quotedPrice: i.quotedPrice })) },
    },
  });
  await applyStockChanges(tx, { type: 'RESERVATION', adminUserId: admin.id, refs: { reservationId: reservation.id }, documentRef: reservation.number },
    d.items.map((i) => ({ productId: i.productId, locationId: d.locationId, bucket: 'RESERVED', delta: i.quantity })));
  await recordStatus(tx, { adminUserId: admin.id, to: 'PENDING', reservationId: reservation.id });
  await writeAudit(tx, { adminUserId: admin.id, action: 'reservation.create', entityType: 'StockReservation', entityId: reservation.id, newValues: { number: reservation.number, items: d.items, expiresAt }, ip });
  return reservation;
}

async function activeReservation(tx, id) {
  await lockRow(tx, 'stock_reservations', id, 'Réservation');
  const r = await tx.stockReservation.findUnique({ where: { id }, include: { items: true } });
  if (r.status === 'PENDING' || r.status === 'CONFIRMED') {
    if (r.expiresAt.getTime() < Date.now()) {
      await expireReservations(tx, r.items.map((i) => i.productId));
      throw errors.invalidTransition('Cette réservation a expiré : le stock a été libéré.');
    }
  }
  return r;
}

export async function transitionReservation(tx, admin, id, action, { reason, expiresAt }, ip) {
  const r = await activeReservation(tx, id);
  if (!ACTIVE_RESERVATION.includes(r.status)) throw errors.invalidTransition('Cette réservation n’est plus active.');
  if (action === 'confirm') {
    if (r.status !== 'PENDING') throw errors.invalidTransition('Réservation déjà confirmée.');
    await tx.stockReservation.update({ where: { id }, data: { status: 'CONFIRMED' } });
    await recordStatus(tx, { adminUserId: admin.id, from: r.status, to: 'CONFIRMED', reason, reservationId: id });
  } else if (action === 'extend') {
    if (!expiresAt || expiresAt.getTime() <= Date.now()) throw new AppError(400, 'VALIDATION_ERROR', 'Nouvelle échéance invalide.');
    await tx.stockReservation.update({ where: { id }, data: { expiresAt } });
    await recordStatus(tx, { adminUserId: admin.id, from: r.status, to: r.status, reason: `Prolongée jusqu'au ${expiresAt.toISOString()}${reason ? ` : ${reason}` : ''}`, reservationId: id });
  } else if (action === 'cancel') {
    await applyStockChanges(tx, { type: 'RESERVATION_RELEASE', adminUserId: admin.id, reason, refs: { reservationId: id }, documentRef: r.number },
      r.items.map((i) => ({ productId: i.productId, locationId: r.locationId, bucket: 'RESERVED', delta: -i.quantity })));
    await tx.stockReservation.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordStatus(tx, { adminUserId: admin.id, from: r.status, to: 'CANCELLED', reason, reservationId: id });
  }
  await writeAudit(tx, { adminUserId: admin.id, action: `reservation.${action}`, entityType: 'StockReservation', entityId: id, reason, ip });
}

// ── Ventes ──────────────────────────────────────────────────────────────────

/**
 * Validation commerciale d'une vente (directe, depuis une réservation, ou née d'un échange).
 * d = { channel, locationId, customerId?, newCustomer?, items: [{ productId, quantity, discountAmount }],
 *       deliveryFee, notes, reservationId?, exchangeReturnId? }
 */
export async function createSale(tx, admin, d, ip) {
  const settings = await settingsOf(tx);
  let reservation = null;
  let items = d.items;
  let locationId = d.locationId;

  if (d.reservationId) {
    reservation = await activeReservation(tx, d.reservationId);
    if (!ACTIVE_RESERVATION.includes(reservation.status)) throw errors.invalidTransition('Cette réservation n’est plus active.');
    locationId = reservation.locationId;
    // La vente reprend exactement les articles réservés ; seules les remises sont saisies.
    items = reservation.items.map((ri) => ({
      productId: ri.productId, quantity: ri.quantity, quotedPrice: ri.quotedPrice,
      discountAmount: d.items?.find((x) => x.productId === ri.productId)?.discountAmount ?? 0,
    }));
  } else {
    await expireReservations(tx, items.map((i) => i.productId));
  }
  await sellableStore(tx, locationId);
  const customer = reservation?.customerId && !d.customerId && !d.newCustomer
    ? await tx.customer.findUnique({ where: { id: reservation.customerId } })
    : await resolveCustomer(tx, admin, d);

  const products = await tx.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } });
  const lines = items.map((i) => {
    const p = products.find((x) => x.id === i.productId);
    if (!p) throw new AppError(400, 'VALIDATION_ERROR', 'Produit inconnu.');
    if (p.status === 'ARCHIVED') throw new AppError(400, 'PRODUCT_ARCHIVED', `${p.name} est archivé.`);
    // Prix appliqué : prix convenu à la réservation, sinon prix du catalogue au moment de la vente.
    const unitPrice = i.quotedPrice ?? p.price;
    if (!unitPrice) throw new AppError(400, 'PRICE_MISSING', `${p.name} n'a pas de prix : demandez à un administrateur de le renseigner.`);
    const discountAmount = i.discountAmount ?? 0;
    if (discountAmount > i.quantity * unitPrice) throw new AppError(400, 'VALIDATION_ERROR', `Remise supérieure au prix pour ${p.name}.`);
    return { product: p, quantity: i.quantity, unitPrice, discountAmount, lineTotal: i.quantity * unitPrice - discountAmount };
  });
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discountAmount, 0);
  const ceiling = discountCeiling(admin.role, settings);
  if (ceiling != null && discountTotal * 100 > subtotal * ceiling) {
    throw new AppError(403, 'DISCOUNT_LIMIT_EXCEEDED', `Remise maximale autorisée pour votre rôle : ${ceiling} % du sous-total.`);
  }
  const deliveryFee = d.channel === 'DELIVERY' ? (d.deliveryFee ?? 0) : 0;

  const sale = await tx.sale.create({
    data: {
      number: await nextNumber(tx, 'SALE'), channel: d.channel, locationId, customerId: customer?.id, reservationId: reservation?.id,
      exchangeReturnId: d.exchangeReturnId, subtotal, discountTotal, deliveryFee, total: subtotal - discountTotal + deliveryFee,
      notes: d.notes, validatedById: admin.id,
    },
  });

  // Affectation du stock à la vente.
  const changes = [];
  const allocation = new Map();
  for (const l of lines) {
    if (reservation) {
      changes.push({ productId: l.product.id, locationId, bucket: 'RESERVED', delta: -l.quantity });
      changes.push({ productId: l.product.id, locationId, bucket: 'ALLOCATED', delta: l.quantity });
      allocation.set(l.product.id, { allocated: l.quantity, backordered: 0 });
    } else {
      allocation.set(l.product.id, { allocated: l.quantity, backordered: 0 });
      changes.push({ productId: l.product.id, locationId, bucket: 'ALLOCATED', delta: l.quantity });
    }
  }
  const ctx = { type: reservation ? 'RESERVATION_TO_SALE' : 'SALE_ALLOCATION', adminUserId: admin.id, refs: { saleId: sale.id, ...(reservation ? { reservationId: reservation.id } : {}) }, documentRef: sale.number };
  try {
    await applyStockChanges(tx, ctx, changes);
  } catch (err) {
    if (!(err instanceof StockInsufficientError) || reservation || !settings.allowBackorder) throw err;
    // Vente au-delà du stock autorisée par le propriétaire : on affecte ce qui est disponible,
    // le reste est « en attente d'approvisionnement ». Les compteurs ne sont jamais forcés.
    const partial = [];
    for (const l of lines) {
      const [row] = await tx.$queryRaw`SELECT GREATEST("onHand" - reserved - allocated, 0)::int AS available FROM stock_levels
        WHERE "productId" = ${l.product.id}::uuid AND "locationId" = ${locationId}::uuid FOR UPDATE`;
      const allocated = Math.min(row?.available ?? 0, l.quantity);
      allocation.set(l.product.id, { allocated, backordered: l.quantity - allocated });
      if (allocated > 0) partial.push({ productId: l.product.id, locationId, bucket: 'ALLOCATED', delta: allocated });
    }
    if (partial.length) await applyStockChanges(tx, ctx, partial);
  }

  for (const l of lines) {
    const a = allocation.get(l.product.id);
    await tx.saleItem.create({
      data: {
        saleId: sale.id, productId: l.product.id, productName: l.product.name, quantity: l.quantity, unitPrice: l.unitPrice,
        discountAmount: l.discountAmount, lineTotal: l.lineTotal, unitCostSnapshot: l.product.averageCost,
        quantityAllocated: a.allocated, quantityBackordered: a.backordered,
      },
    });
  }

  if (reservation) {
    await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: 'CONVERTED' } });
    await recordStatus(tx, { adminUserId: admin.id, from: reservation.status, to: 'CONVERTED', reason: `Vente ${sale.number}`, reservationId: reservation.id });
    // Les acomptes versés sur la réservation sont rattachés à la vente : comptés une seule fois.
    await tx.payment.updateMany({ where: { reservationId: reservation.id, saleId: null }, data: { saleId: sale.id } });
  }
  await recordStatus(tx, { adminUserId: admin.id, to: 'VALIDATED', saleId: sale.id });
  await writeAudit(tx, {
    adminUserId: admin.id, action: 'sale.validate', entityType: 'Sale', entityId: sale.id,
    newValues: { number: sale.number, total: sale.total, discountTotal, channel: d.channel, reservation: reservation?.number }, ip,
  });
  return sale;
}

export async function cancelSale(tx, admin, id, reason, ip) {
  await lockRow(tx, 'sales', id, 'Vente');
  const sale = await tx.sale.findUnique({ where: { id }, include: { items: true, fulfillments: true } });
  if (sale.status !== 'VALIDATED') throw errors.invalidTransition('Cette vente est déjà annulée.');
  if (sale.items.some((i) => i.quantityHandedOver > 0)) throw errors.invalidTransition('Des articles ont déjà été remis : enregistrez un retour.');
  if (sale.fulfillments.some((f) => ['IN_TRANSIT', 'FAILED'].includes(f.status))) throw errors.invalidTransition('Une livraison est en cours : traitez-la avant d’annuler.');
  for (const f of sale.fulfillments.filter((x) => ['PREPARING', 'READY'].includes(x.status))) {
    await tx.saleFulfillment.update({ where: { id: f.id }, data: { status: 'CANCELLED' } });
    await tx.fulfillmentEvent.create({ data: { fulfillmentId: f.id, fromStatus: f.status, toStatus: 'CANCELLED', note: 'Vente annulée', adminUserId: admin.id } });
  }
  const changes = sale.items.filter((i) => i.quantityAllocated > 0).map((i) => ({ productId: i.productId, locationId: sale.locationId, bucket: 'ALLOCATED', delta: -i.quantityAllocated }));
  if (changes.length) await applyStockChanges(tx, { type: 'SALE_ALLOCATION_RELEASE', adminUserId: admin.id, reason, refs: { saleId: id }, documentRef: sale.number }, changes);
  for (const i of sale.items) {
    await tx.saleItem.update({ where: { id: i.id }, data: { quantityCancelled: i.quantityAllocated + i.quantityBackordered, quantityAllocated: 0, quantityBackordered: 0 } });
  }
  await tx.sale.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
  await recordStatus(tx, { adminUserId: admin.id, from: 'VALIDATED', to: 'CANCELLED', reason, saleId: id });
  await writeAudit(tx, { adminUserId: admin.id, action: 'sale.cancel', entityType: 'Sale', entityId: id, reason, ip });
}

/** Affecte du stock arrivé aux quantités « en attente d'approvisionnement ». */
export async function allocateBackorders(tx, admin, id) {
  await lockRow(tx, 'sales', id, 'Vente');
  const sale = await tx.sale.findUnique({ where: { id }, include: { items: true } });
  if (sale.status !== 'VALIDATED') throw errors.invalidTransition('Vente annulée.');
  let done = 0;
  for (const i of sale.items.filter((x) => x.quantityBackordered > 0)) {
    const [row] = await tx.$queryRaw`SELECT GREATEST("onHand" - reserved - allocated, 0)::int AS available FROM stock_levels WHERE "productId" = ${i.productId}::uuid AND "locationId" = ${sale.locationId}::uuid FOR UPDATE`;
    const q = Math.min(row?.available ?? 0, i.quantityBackordered);
    if (!q) continue;
    await applyStockChanges(tx, { type: 'SALE_ALLOCATION', adminUserId: admin.id, refs: { saleId: id }, documentRef: sale.number }, [{ productId: i.productId, locationId: sale.locationId, bucket: 'ALLOCATED', delta: q }]);
    await tx.saleItem.update({ where: { id: i.id }, data: { quantityAllocated: { increment: q }, quantityBackordered: { decrement: q } } });
    done += q;
  }
  return done;
}

// ── Paiements et remboursements ─────────────────────────────────────────────

export async function saleBalance(tx, saleId) {
  const [b] = await tx.$queryRaw`SELECT total, "netTotal", collected, refunded, "amountDue", "paymentStatus" FROM sale_balance WHERE "saleId" = ${saleId}::uuid`;
  return b;
}

export async function recordPayment(tx, admin, { saleId, reservationId, amount, methodCode, externalReference, receivedAt }, ip) {
  const method = await paymentMethod(tx, methodCode);
  if (saleId) {
    await lockRow(tx, 'sales', saleId, 'Vente');
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (sale.status !== 'VALIDATED') throw errors.invalidTransition('Vente annulée : aucun encaissement possible.');
    const b = await saleBalance(tx, saleId);
    if (amount > b.amountDue) throw new AppError(400, 'OVERPAYMENT', `Le montant dépasse le reste à payer (${b.amountDue} FCFA).`);
  } else {
    const r = await activeReservation(tx, reservationId);
    if (!ACTIVE_RESERVATION.includes(r.status)) throw errors.invalidTransition('Cette réservation n’est plus active.');
  }
  const payment = await tx.payment.create({
    data: {
      reference: await nextNumber(tx, 'PAYMENT'), saleId: saleId ?? null, reservationId: reservationId ?? null, amount,
      paymentMethodId: method.id, externalReference, receivedAt: receivedAt ?? new Date(), recordedById: admin.id,
    },
  });
  await recordStatus(tx, { adminUserId: admin.id, to: 'RECORDED', paymentId: payment.id });
  await writeAudit(tx, { adminUserId: admin.id, action: 'payment.record', entityType: 'Payment', entityId: payment.id, newValues: { reference: payment.reference, amount, method: methodCode, saleId, reservationId }, ip });
  return payment;
}

export async function voidPayment(tx, admin, id, reason, ip) {
  await lockRow(tx, 'payments', id, 'Paiement');
  const p = await tx.payment.findUnique({ where: { id }, include: { refunds: { where: { status: 'RECORDED' } } } });
  if (p.status !== 'RECORDED') throw errors.invalidTransition('Paiement déjà annulé.');
  if (p.refunds.length) throw errors.invalidTransition('Ce paiement a des remboursements : annulez-les d’abord.');
  await tx.payment.update({ where: { id }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason } });
  await recordStatus(tx, { adminUserId: admin.id, from: 'RECORDED', to: 'VOIDED', reason, paymentId: id });
  await writeAudit(tx, { adminUserId: admin.id, action: 'payment.void', entityType: 'Payment', entityId: id, oldValues: { amount: p.amount }, reason, ip });
}

/** Remboursement : toujours lié au paiement d'origine ; ne touche jamais au stock. */
export async function recordRefund(tx, admin, paymentId, { amount, methodCode, reason, returnId }, ip) {
  await lockRow(tx, 'payments', paymentId, 'Paiement');
  const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { refunds: { where: { status: 'RECORDED' } } } });
  if (p.status !== 'RECORDED') throw errors.invalidTransition('Paiement annulé : aucun remboursement possible.');
  const already = p.refunds.reduce((s, r) => s + r.amount, 0);
  if (already + amount > p.amount) throw new AppError(400, 'REFUND_EXCEEDS_PAYMENT', `Remboursable sur ce paiement : ${p.amount - already} FCFA.`);
  if (returnId) {
    const ret = await tx.return.findUnique({ where: { id: returnId } });
    if (!ret || ret.saleId !== p.saleId) throw new AppError(400, 'VALIDATION_ERROR', 'Ce retour ne concerne pas la vente de ce paiement.');
  }
  const method = await paymentMethod(tx, methodCode);
  const refund = await tx.refund.create({
    data: {
      reference: await nextNumber(tx, 'REFUND'), paymentId, saleId: p.saleId, returnId, amount, paymentMethodId: method.id,
      reason, refundedAt: new Date(), recordedById: admin.id,
    },
  });
  await writeAudit(tx, { adminUserId: admin.id, action: 'refund.record', entityType: 'Refund', entityId: refund.id, newValues: { reference: refund.reference, amount, paymentId }, reason, ip });
  return refund;
}

// ── Remise au client : retrait et livraison ─────────────────────────────────

async function openQuantities(tx, saleId) {
  const rows = await tx.$queryRaw`
    SELECT fi."saleItemId", SUM(fi.quantity)::int AS qty FROM fulfillment_items fi
    JOIN sale_fulfillments f ON f.id = fi."fulfillmentId"
    WHERE f."saleId" = ${saleId}::uuid AND f.status IN ('PREPARING', 'READY', 'IN_TRANSIT', 'FAILED')
    GROUP BY fi."saleItemId"`;
  return new Map(rows.map((r) => [r.saleItemId, r.qty]));
}

/** Crée une remise (retrait ou livraison) pour tout ou partie des articles affectés. */
export async function createFulfillment(tx, admin, saleId, d, ip) {
  await lockRow(tx, 'sales', saleId, 'Vente');
  const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (sale.status !== 'VALIDATED') throw errors.invalidTransition('Vente annulée.');
  const open = await openQuantities(tx, saleId);
  const wanted = d.items ?? sale.items.map((i) => ({ saleItemId: i.id, quantity: i.quantityAllocated - (open.get(i.id) ?? 0) })).filter((x) => x.quantity > 0);
  if (!wanted.length) throw errors.invalidTransition('Aucun article à remettre pour cette vente.');
  for (const w of wanted) {
    const item = sale.items.find((i) => i.id === w.saleItemId);
    const free = item ? item.quantityAllocated - (open.get(item.id) ?? 0) : 0;
    if (!item || w.quantity > free) throw new AppError(400, 'QUANTITY_UNAVAILABLE', `${item?.productName ?? 'Article'} : ${free} unité(s) prête(s) à être remise(s).`);
  }
  const f = await tx.saleFulfillment.create({
    data: {
      number: await nextNumber(tx, 'FULFILLMENT'), saleId, mode: d.mode, locationId: sale.locationId, createdById: admin.id,
      ...(d.mode === 'DELIVERY' ? d.delivery : {}),
      items: { create: wanted.map((w) => ({ saleItemId: w.saleItemId, quantity: w.quantity })) },
    },
  });
  await tx.fulfillmentEvent.create({ data: { fulfillmentId: f.id, toStatus: 'PREPARING', adminUserId: admin.id } });
  await writeAudit(tx, { adminUserId: admin.id, action: 'fulfillment.create', entityType: 'SaleFulfillment', entityId: f.id, newValues: { mode: d.mode, items: wanted }, ip });
  return f;
}

async function loadFulfillment(tx, id) {
  await lockRow(tx, 'sale_fulfillments', id, 'Remise');
  return tx.saleFulfillment.findUnique({
    where: { id },
    include: { sale: true, items: { include: { saleItem: { include: { product: true } } } } },
  });
}

const TRANSITIONS = {
  ready: { from: ['PREPARING'], to: 'READY' },
  dispatch: { from: ['READY', 'PREPARING'], to: 'IN_TRANSIT', mode: 'DELIVERY' },
  complete: { from: ['PREPARING', 'READY', 'IN_TRANSIT'], to: 'COMPLETED' },
  fail: { from: ['IN_TRANSIT'], to: 'FAILED', mode: 'DELIVERY' },
  retry: { from: ['FAILED'], to: 'IN_TRANSIT', mode: 'DELIVERY' },
  returnToStore: { from: ['FAILED'], to: 'RETURNED_TO_STORE', mode: 'DELIVERY' },
  cancel: { from: ['PREPARING', 'READY'], to: 'CANCELLED' },
};

/**
 * d = { note?, receivedByName?, proofNote?, courierName?, courierPhone?, serials?: { [saleItemId]: [serialId] } }
 */
export async function transitionFulfillment(tx, admin, id, action, d, ip) {
  const rule = TRANSITIONS[action];
  const f = await loadFulfillment(tx, id);
  if (!rule.from.includes(f.status)) throw errors.invalidTransition(`Action impossible depuis l'état actuel de la remise.`);
  if (rule.mode && f.mode !== rule.mode) throw errors.invalidTransition('Action réservée aux livraisons.');
  if (action === 'complete' && f.mode === 'DELIVERY' && f.status !== 'IN_TRANSIT') throw errors.invalidTransition('Remettez d’abord la livraison au livreur.');
  const transit = f.mode === 'DELIVERY' ? await transitLocation(tx) : null;
  const store = f.locationId;
  const ctx = (type) => ({ type, adminUserId: admin.id, reason: d.note, refs: { saleId: f.saleId, fulfillmentId: id }, documentRef: f.number });
  const data = { status: rule.to };
  const sale = f.sale;
  const customerId = sale.customerId;

  // Numéros de série : vérifiés au moment où l'appareil quitte la boutique.
  async function serialsFor(fi, statuses, locationId) {
    if (!fi.saleItem.product.isSerialized) return null;
    const ids = d.serials?.[fi.saleItemId] ?? [];
    if (ids.length !== fi.quantity) throw new AppError(400, 'SERIALS_REQUIRED', `${fi.saleItem.productName} : sélectionnez ${fi.quantity} numéro(s) de série.`);
    return lockSerials(tx, { productId: fi.saleItem.productId, locationId, serialIds: ids, statuses });
  }
  const shippedSerials = async (fi) => (await tx.stockMovement.findMany({
    where: { fulfillmentId: id, type: 'DISPATCH_TO_TRANSIT', productId: fi.saleItem.productId, bucket: 'ON_HAND', quantityDelta: { gt: 0 }, serialNumberId: { not: null } },
    select: { serialNumberId: true }, orderBy: { createdAt: 'desc' }, take: fi.quantity,
  })).map((m) => ({ id: m.serialNumberId }));

  if (action === 'dispatch') {
    const changes = [];
    for (const fi of f.items) {
      const serials = await serialsFor(fi, ['IN_STOCK'], store);
      const base = (loc, bucket, delta) => ({ productId: fi.saleItem.productId, locationId: loc, bucket, delta });
      if (serials) {
        await tx.productSerialNumber.updateMany({ where: { id: { in: serials.map((s) => s.id) } }, data: { status: 'IN_TRANSIT', locationId: transit.id, saleItemId: fi.saleItemId, customerId } });
        changes.push(...perSerial(base(store, 'ALLOCATED', -1), serials), ...perSerial(base(store, 'ON_HAND', -1), serials),
          ...perSerial(base(transit.id, 'ON_HAND', 1), serials), ...perSerial(base(transit.id, 'ALLOCATED', 1), serials));
      } else {
        changes.push(base(store, 'ALLOCATED', -fi.quantity), base(store, 'ON_HAND', -fi.quantity), base(transit.id, 'ON_HAND', fi.quantity), base(transit.id, 'ALLOCATED', fi.quantity));
      }
    }
    await applyStockChanges(tx, ctx('DISPATCH_TO_TRANSIT'), changes);
    Object.assign(data, { shippedAt: new Date(), ...(d.courierName ? { courierName: d.courierName } : {}), ...(d.courierPhone ? { courierPhone: d.courierPhone } : {}) });
  }

  if (action === 'complete') {
    if (!d.receivedByName) throw new AppError(400, 'VALIDATION_ERROR', 'Indiquez le nom de la personne qui reçoit.', [{ field: 'receivedByName', message: 'Obligatoire' }]);
    const changes = [];
    const now = new Date();
    for (const fi of f.items) {
      const loc = f.mode === 'DELIVERY' ? transit.id : store;
      const base = (bucket, delta) => ({ productId: fi.saleItem.productId, locationId: loc, bucket, delta });
      let serials = null;
      if (fi.saleItem.product.isSerialized) {
        serials = f.mode === 'DELIVERY' ? await shippedSerials(fi) : await serialsFor(fi, ['IN_STOCK'], store);
        const warranty = fi.saleItem.product.warrantyMonths;
        const ends = warranty ? new Date(new Date(now).setMonth(now.getMonth() + warranty)) : null;
        await tx.productSerialNumber.updateMany({ where: { id: { in: serials.map((s) => s.id) } }, data: { status: 'DELIVERED', locationId: null, saleItemId: fi.saleItemId, customerId, warrantyEndsAt: ends } });
      }
      changes.push(...(serials ? [...perSerial(base('ALLOCATED', -1), serials), ...perSerial(base('ON_HAND', -1), serials)] : [base('ALLOCATED', -fi.quantity), base('ON_HAND', -fi.quantity)]));
      await tx.saleItem.update({ where: { id: fi.saleItemId }, data: { quantityAllocated: { decrement: fi.quantity }, quantityHandedOver: { increment: fi.quantity } } });
    }
    await applyStockChanges(tx, ctx(f.mode === 'DELIVERY' ? 'DELIVERY_COMPLETED' : 'SALE_HANDOVER'), changes);
    Object.assign(data, { completedAt: now, receivedByName: d.receivedByName, proofNote: d.proofNote ?? null });
  }

  if (action === 'returnToStore') {
    const changes = [];
    for (const fi of f.items) {
      const base = (loc, bucket, delta) => ({ productId: fi.saleItem.productId, locationId: loc, bucket, delta });
      if (fi.saleItem.product.isSerialized) {
        const serials = await shippedSerials(fi);
        await tx.productSerialNumber.updateMany({ where: { id: { in: serials.map((s) => s.id) } }, data: { status: 'IN_STOCK', locationId: store } });
        changes.push(...perSerial(base(transit.id, 'ALLOCATED', -1), serials), ...perSerial(base(transit.id, 'ON_HAND', -1), serials),
          ...perSerial(base(store, 'ON_HAND', 1), serials), ...perSerial(base(store, 'ALLOCATED', 1), serials));
      } else {
        changes.push(base(transit.id, 'ALLOCATED', -fi.quantity), base(transit.id, 'ON_HAND', -fi.quantity), base(store, 'ON_HAND', fi.quantity), base(store, 'ALLOCATED', fi.quantity));
      }
    }
    // La marchandise revient en boutique, toujours affectée à la vente : une nouvelle remise peut être créée.
    await applyStockChanges(tx, ctx('DELIVERY_RETURNED'), changes);
  }

  await tx.saleFulfillment.update({ where: { id }, data });
  await tx.fulfillmentEvent.create({ data: { fulfillmentId: id, fromStatus: f.status, toStatus: rule.to, note: d.note ?? null, adminUserId: admin.id } });
  await writeAudit(tx, { adminUserId: admin.id, action: `fulfillment.${action}`, entityType: 'SaleFulfillment', entityId: id, oldValues: { status: f.status }, newValues: { status: rule.to }, reason: d.note, ip });
  return { id, status: rule.to };
}

// ── Retours ─────────────────────────────────────────────────────────────────

const RETURN_BUCKET = { RESTOCKED: 'ON_HAND', QUARANTINE: 'QUARANTINE', DAMAGED: 'DAMAGED', NOT_REINTEGRABLE: 'DAMAGED' };
const RETURN_SERIAL_STATUS = { RESTOCKED: 'IN_STOCK', QUARANTINE: 'QUARANTINE', DAMAGED: 'DAMAGED', NOT_REINTEGRABLE: 'DAMAGED' };

/** Retour physique : l'état de chaque article est saisi avant toute réintégration. */
export async function createReturn(tx, admin, saleId, d, ip) {
  await lockRow(tx, 'sales', saleId, 'Vente');
  const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: { include: { product: true } } } });
  const location = await tx.stockLocation.findUnique({ where: { id: d.locationId } });
  if (!location || location.type === 'TRANSIT') throw new AppError(400, 'INVALID_LOCATION', 'Emplacement de réception invalide.');
  const ret = await tx.return.create({
    data: { number: await nextNumber(tx, 'RETURN'), saleId, reason: d.reason, locationId: d.locationId, notes: d.notes, receivedById: admin.id, receivedAt: new Date() },
  });
  const changes = [];
  for (const line of d.items) {
    const item = sale.items.find((i) => i.id === line.saleItemId);
    if (!item) throw new AppError(400, 'VALIDATION_ERROR', 'Article inconnu dans cette vente.');
    const returnable = item.quantityHandedOver - item.quantityReturned;
    if (line.quantity > returnable) throw new AppError(400, 'RETURN_EXCEEDS_HANDOVER', `${item.productName} : ${returnable} unité(s) remise(s) et non encore retournée(s).`);
    const bucket = RETURN_BUCKET[line.condition];
    let serialRef = null;
    if (item.product.isSerialized) {
      const ids = line.serialIds ?? [];
      if (ids.length !== line.quantity) throw new AppError(400, 'SERIALS_REQUIRED', `${item.productName} : indiquez les numéros de série retournés.`);
      const serials = await lockSerials(tx, { productId: item.productId, serialIds: ids, statuses: ['DELIVERED'] });
      const owned = await tx.productSerialNumber.count({ where: { id: { in: ids }, saleItemId: item.id } });
      if (owned !== ids.length) throw new AppError(409, 'SERIAL_UNAVAILABLE', "Un appareil indiqué n'a pas été vendu dans cette vente.");
      await tx.productSerialNumber.updateMany({ where: { id: { in: ids } }, data: { status: RETURN_SERIAL_STATUS[line.condition], locationId: d.locationId } });
      serialRef = serials;
    }
    await tx.returnItem.create({ data: { returnId: ret.id, saleItemId: item.id, quantity: line.quantity, condition: line.condition, serialNumberId: serialRef?.length === 1 ? serialRef[0].id : null } });
    await tx.saleItem.update({ where: { id: item.id }, data: { quantityReturned: { increment: line.quantity } } });
    const base = { productId: item.productId, locationId: d.locationId, bucket, delta: line.quantity };
    changes.push(...(serialRef ? perSerial(base, serialRef) : [base]));
  }
  await applyStockChanges(tx, { type: d.reason === 'EXCHANGE' ? 'EXCHANGE' : 'CUSTOMER_RETURN', adminUserId: admin.id, reason: d.notes, refs: { saleId, returnId: ret.id }, documentRef: ret.number }, changes);
  await writeAudit(tx, { adminUserId: admin.id, action: 'return.create', entityType: 'Return', entityId: ret.id, newValues: { number: ret.number, saleId, items: d.items }, ip });
  return ret;
}

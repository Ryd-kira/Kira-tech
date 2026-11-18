import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

/**
 * Grand livre du stock : SEUL code autorisé à modifier stock_levels.
 *
 * Chaque variation :
 *  1. est appliquée par une instruction UPDATE conditionnelle (vérification + écriture en une
 *     seule opération : deux caisses ne peuvent pas prendre la même dernière unité) ;
 *  2. écrit sa ligne stock_movements avec les quantités avant / après renvoyées par l'UPDATE ;
 *  3. s'exécute dans la transaction de l'opération métier (tout ou rien).
 *
 * Les lignes sont traitées triées par (produit, emplacement) pour éviter les interblocages ;
 * l'ordre relatif des variations d'une même ligne est conservé (ex. affecté -q puis physique -q).
 */

const COLUMN = { ON_HAND: 'onHand', RESERVED: 'reserved', ALLOCATED: 'allocated', QUARANTINE: 'quarantine', DAMAGED: 'damaged' };
const AVAILABLE = Prisma.sql`"onHand" - reserved - allocated`;

// Condition à respecter pour que la variation soit acceptée (en plus des CHECK de la base).
function guardFor(bucket, delta) {
  const q = Math.abs(delta);
  const col = Prisma.raw(`"${COLUMN[bucket]}"`);
  if (delta > 0 && (bucket === 'RESERVED' || bucket === 'ALLOCATED')) return Prisma.sql`${AVAILABLE} >= ${q}`;
  if (delta < 0 && bucket === 'ON_HAND') return Prisma.sql`${AVAILABLE} >= ${q}`;
  if (delta < 0) return Prisma.sql`${col} >= ${q}`;
  return Prisma.sql`TRUE`;
}

export class StockInsufficientError extends AppError {
  constructor(change, product, location) {
    super(409, 'STOCK_INSUFFICIENT',
      `Stock insuffisant : ${product?.name ?? 'produit'} à ${location?.name ?? 'cet emplacement'}.`,
      [{ productId: change.productId, locationId: change.locationId, bucket: change.bucket, requested: Math.abs(change.delta) }]);
  }
}

/**
 * @param tx client de transaction Prisma
 * @param ctx { type, adminUserId, reason?, documentRef?, refs?: { saleId, reservationId, purchaseReceiptId, transferId, fulfillmentId, returnId } }
 * @param changes [{ productId, locationId, bucket, delta, serialNumberId? }]
 * @returns { operationId, movements }
 */
export async function applyStockChanges(tx, ctx, changes) {
  if (!changes.length) throw new Error('applyStockChanges : aucune variation');
  const operationId = ctx.operationId ?? randomUUID();
  const indexed = changes.map((c, i) => ({ ...c, i }));
  indexed.sort((a, b) => a.productId.localeCompare(b.productId) || a.locationId.localeCompare(b.locationId) || a.i - b.i);

  const movements = [];
  for (const c of indexed) {
    if (!Number.isInteger(c.delta) || c.delta === 0) throw new Error('applyStockChanges : variation invalide');
    if (!COLUMN[c.bucket]) throw new Error(`applyStockChanges : compartiment inconnu ${c.bucket}`);
    const col = Prisma.raw(`"${COLUMN[c.bucket]}"`);

    await tx.$executeRaw`
      INSERT INTO stock_levels ("productId", "locationId", "updatedAt")
      VALUES (${c.productId}::uuid, ${c.locationId}::uuid, now())
      ON CONFLICT ("productId", "locationId") DO NOTHING`;

    const rows = await tx.$queryRaw`
      UPDATE stock_levels SET ${col} = ${col} + ${c.delta}, "updatedAt" = now()
      WHERE "productId" = ${c.productId}::uuid AND "locationId" = ${c.locationId}::uuid
        AND ${guardFor(c.bucket, c.delta)}
      RETURNING ${col} AS after`;

    if (rows.length === 0) {
      const [product, location] = await Promise.all([
        tx.product.findUnique({ where: { id: c.productId }, select: { name: true } }),
        tx.stockLocation.findUnique({ where: { id: c.locationId }, select: { name: true } }),
      ]);
      throw new StockInsufficientError(c, product, location);
    }
    const after = rows[0].after;
    movements.push(await tx.stockMovement.create({
      data: {
        operationId, type: ctx.type, productId: c.productId, locationId: c.locationId, bucket: c.bucket,
        quantityBefore: after - c.delta, quantityDelta: c.delta, quantityAfter: after,
        reason: ctx.reason ?? null, documentRef: ctx.documentRef ?? null, adminUserId: ctx.adminUserId,
        serialNumberId: c.serialNumberId ?? null, ...(ctx.refs ?? {}),
      },
    }));
  }
  return { operationId, movements };
}

/** Pour un produit suivi par numéro de série : une variation d'une unité par appareil. */
export function perSerial(base, serials) {
  const sign = Math.sign(base.delta);
  return serials.map((s) => ({ ...base, delta: sign, serialNumberId: s.id }));
}

/** Vérifie que les numéros de série désignés existent, appartiennent au produit et sont au bon endroit. */
export async function lockSerials(tx, { productId, locationId, serialIds, statuses = ['IN_STOCK'] }) {
  const unique = [...new Set(serialIds)];
  if (unique.length !== serialIds.length) throw new AppError(400, 'VALIDATION_ERROR', 'Un numéro de série est sélectionné deux fois.');
  const rows = await tx.$queryRaw`
    SELECT id, "serialNumber", status, "locationId" FROM product_serial_numbers
    WHERE id IN (${Prisma.join(unique.map((id) => Prisma.sql`${id}::uuid`))}) AND "productId" = ${productId}::uuid
    FOR UPDATE`;
  const bad = unique.filter((id) => {
    const r = rows.find((x) => x.id === id);
    return !r || !statuses.includes(r.status) || (locationId && r.locationId !== locationId);
  });
  if (bad.length) {
    throw new AppError(409, 'SERIAL_UNAVAILABLE', 'Un ou plusieurs numéros de série ne sont pas disponibles à cet emplacement.', bad.map((id) => ({ serialId: id })));
  }
  return rows;
}

export async function transitLocation(tx) {
  const loc = await tx.stockLocation.findFirst({ where: { type: 'TRANSIT' } });
  if (!loc) throw new Error('Emplacement « En transit » absent : lancer le seed des référentiels.');
  return loc;
}

/** Historique de statut (addendum 3 §G). */
export function recordStatus(tx, { adminUserId, from, to, reason, ...target }) {
  return tx.statusChange.create({ data: { adminUserId, fromStatus: from ?? null, toStatus: to, reason: reason ?? null, ...target } });
}

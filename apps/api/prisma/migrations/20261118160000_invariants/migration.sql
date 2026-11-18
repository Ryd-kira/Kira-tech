-- Invariants métier que Prisma ne sait pas exprimer.
-- Règle : la base refuse les données incohérentes, même si le code a un bug.

-- ── Paramètres ────────────────────────────────────────────────
ALTER TABLE site_settings
  ADD CONSTRAINT site_settings_singleton CHECK (id = 1),
  ADD CONSTRAINT site_settings_reservation_hours CHECK ("reservationDefaultHours" BETWEEN 1 AND 720),
  ADD CONSTRAINT site_settings_discounts CHECK (
    "maxDiscountPercentAdmin" BETWEEN 0 AND 100 AND "maxDiscountPercentManager" BETWEEN 0 AND 100);

ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_email_lower CHECK (email = lower(email)),
  ADD CONSTRAINT admin_users_failed_login CHECK ("failedLoginCount" >= 0);

-- ── Catalogue ─────────────────────────────────────────────────
ALTER TABLE products
  ADD CONSTRAINT products_price CHECK (price >= 0),
  ADD CONSTRAINT products_threshold CHECK ("lowStockThreshold" >= 0),
  ADD CONSTRAINT products_ram CHECK ("ramGb" IS NULL OR "ramGb" > 0),
  ADD CONSTRAINT products_storage CHECK ("storageGb" IS NULL OR "storageGb" > 0),
  ADD CONSTRAINT products_warranty CHECK ("warrantyMonths" IS NULL OR "warrantyMonths" >= 0),
  ADD CONSTRAINT products_avg_cost CHECK ("averageCost" >= 0);

ALTER TABLE product_images ADD CONSTRAINT product_images_sort CHECK ("sortOrder" >= 0);

-- ── Stock ─────────────────────────────────────────────────────
ALTER TABLE stock_levels
  ADD CONSTRAINT stock_levels_non_negative CHECK (
    "onHand" >= 0 AND reserved >= 0 AND allocated >= 0 AND quarantine >= 0 AND damaged >= 0),
  -- Impossible de réserver ou d'affecter plus que le stock physique :
  -- c'est la garantie finale contre la survente et la double réservation.
  ADD CONSTRAINT stock_levels_blocked_le_on_hand CHECK (reserved + allocated <= "onHand");

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_delta CHECK ("quantityDelta" <> 0),
  ADD CONSTRAINT stock_movements_arithmetic CHECK ("quantityAfter" = "quantityBefore" + "quantityDelta"),
  ADD CONSTRAINT stock_movements_after CHECK ("quantityAfter" >= 0 AND "quantityBefore" >= 0);

ALTER TABLE stock_transfers
  ADD CONSTRAINT stock_transfers_distinct CHECK ("sourceLocationId" <> "destinationLocationId");
ALTER TABLE stock_transfer_items ADD CONSTRAINT stock_transfer_items_qty CHECK (quantity > 0);

-- ── Achats ────────────────────────────────────────────────────
ALTER TABLE purchases
  ADD CONSTRAINT purchases_amounts CHECK (
    "additionalCosts" >= 0 AND "itemsTotal" >= 0 AND "totalAmount" = "itemsTotal" + "additionalCosts");
ALTER TABLE purchase_items
  ADD CONSTRAINT purchase_items_qty CHECK ("quantityOrdered" > 0),
  ADD CONSTRAINT purchase_items_received CHECK ("quantityReceived" BETWEEN 0 AND "quantityOrdered"),
  ADD CONSTRAINT purchase_items_cost CHECK ("unitCost" >= 0 AND "landedUnitCost" >= 0);
ALTER TABLE purchase_receipt_items ADD CONSTRAINT purchase_receipt_items_qty CHECK (quantity > 0);

-- ── Réservations ──────────────────────────────────────────────
ALTER TABLE reservation_items
  ADD CONSTRAINT reservation_items_qty CHECK (quantity > 0),
  ADD CONSTRAINT reservation_items_price CHECK ("quotedPrice" IS NULL OR "quotedPrice" >= 0);

-- ── Ventes ────────────────────────────────────────────────────
ALTER TABLE sales
  ADD CONSTRAINT sales_amounts CHECK (
    subtotal >= 0 AND "discountTotal" >= 0 AND "deliveryFee" >= 0
    AND "discountTotal" <= subtotal
    AND total = subtotal - "discountTotal" + "deliveryFee"),
  ADD CONSTRAINT sales_delivery_fee_channel CHECK (channel = 'DELIVERY' OR "deliveryFee" = 0),
  ADD CONSTRAINT sales_cancel_consistency CHECK (
    (status = 'CANCELLED') = ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL));

ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_qty CHECK (quantity > 0 AND "unitPrice" >= 0),
  ADD CONSTRAINT sale_items_discount CHECK ("discountAmount" BETWEEN 0 AND quantity * "unitPrice"),
  ADD CONSTRAINT sale_items_line_total CHECK ("lineTotal" = quantity * "unitPrice" - "discountAmount"),
  ADD CONSTRAINT sale_items_allocation CHECK (
    "quantityAllocated" >= 0 AND "quantityBackordered" >= 0 AND "quantityCancelled" >= 0
    AND "quantityAllocated" + "quantityBackordered" + "quantityHandedOver" + "quantityCancelled" = quantity),
  ADD CONSTRAINT sale_items_handover CHECK ("quantityHandedOver" BETWEEN 0 AND quantity),
  ADD CONSTRAINT sale_items_returned CHECK ("quantityReturned" BETWEEN 0 AND "quantityHandedOver");

-- ── Paiements et remboursements ───────────────────────────────
ALTER TABLE payments
  ADD CONSTRAINT payments_amount CHECK (amount > 0),
  ADD CONSTRAINT payments_target CHECK ("saleId" IS NOT NULL OR "reservationId" IS NOT NULL),
  ADD CONSTRAINT payments_void_consistency CHECK (
    (status = 'VOIDED') = ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL));

ALTER TABLE refunds
  ADD CONSTRAINT refunds_amount CHECK (amount > 0),
  ADD CONSTRAINT refunds_void_consistency CHECK (
    (status = 'VOIDED') = ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL));

-- ── Remises au client et livraisons ───────────────────────────
ALTER TABLE sale_fulfillments
  ADD CONSTRAINT fulfillments_delivery_fields CHECK (
    mode = 'PICKUP' OR ("recipientPhone" IS NOT NULL AND address IS NOT NULL AND city IS NOT NULL)),
  ADD CONSTRAINT fulfillments_completion_proof CHECK (
    status <> 'COMPLETED' OR ("completedAt" IS NOT NULL AND "receivedByName" IS NOT NULL)),
  ADD CONSTRAINT fulfillments_pickup_states CHECK (
    mode = 'DELIVERY' OR status IN ('PREPARING', 'READY', 'COMPLETED', 'CANCELLED'));
ALTER TABLE fulfillment_items ADD CONSTRAINT fulfillment_items_qty CHECK (quantity > 0);

-- ── Retours ───────────────────────────────────────────────────
ALTER TABLE return_items ADD CONSTRAINT return_items_qty CHECK (quantity > 0);

-- ── Historique des statuts : exactement une entité visée ──────
ALTER TABLE status_changes ADD CONSTRAINT status_changes_one_target CHECK (
  num_nonnulls("reservationId", "saleId", "paymentId", "purchaseId", "transferId", "returnId") = 1);

-- ══════════════════════════════════════════════════════════════
-- Tables append-only : ni UPDATE, ni DELETE, ni TRUNCATE.
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION kts_forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'KTS_IMMUTABLE: % sur % interdit (historique non modifiable)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_movements','audit_logs','status_changes','fulfillment_events',
                           'purchase_receipts','purchase_receipt_items','returns','return_items']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_no_update_delete BEFORE UPDATE OR DELETE ON %I
                    FOR EACH ROW EXECUTE FUNCTION kts_forbid_change()', t, t);
    EXECUTE format('CREATE TRIGGER %I_no_truncate BEFORE TRUNCATE ON %I
                    FOR EACH STATEMENT EXECUTE FUNCTION kts_forbid_change()', t, t);
  END LOOP;
END $$;

-- Documents commerciaux validés : jamais supprimés.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_items','payments','refunds','stock_reservations',
                           'reservation_items','purchases','purchase_items','sale_fulfillments',
                           'fulfillment_items','stock_transfers','stock_transfer_items',
                           'product_serial_numbers']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_no_delete BEFORE DELETE ON %I
                    FOR EACH ROW EXECUTE FUNCTION kts_forbid_change()', t, t);
    EXECUTE format('CREATE TRIGGER %I_no_truncate BEFORE TRUNCATE ON %I
                    FOR EACH STATEMENT EXECUTE FUNCTION kts_forbid_change()', t, t);
  END LOOP;
END $$;

-- Vente : numéro, conditions commerciales et montants figés après validation.
CREATE OR REPLACE FUNCTION kts_sale_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number <> OLD.number OR NEW.channel <> OLD.channel OR NEW."locationId" <> OLD."locationId"
     OR NEW.subtotal <> OLD.subtotal OR NEW."discountTotal" <> OLD."discountTotal"
     OR NEW."deliveryFee" <> OLD."deliveryFee" OR NEW.total <> OLD.total
     OR NEW."validatedAt" <> OLD."validatedAt" OR NEW."validatedById" <> OLD."validatedById"
     OR NEW."reservationId" IS DISTINCT FROM OLD."reservationId" THEN
    RAISE EXCEPTION 'KTS_IMMUTABLE: conditions commerciales d''une vente validée' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'KTS_IMMUTABLE: vente annulée' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_guard BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION kts_sale_guard();

CREATE OR REPLACE FUNCTION kts_sale_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."saleId" <> OLD."saleId" OR NEW."productId" <> OLD."productId" OR NEW.quantity <> OLD.quantity
     OR NEW."unitPrice" <> OLD."unitPrice" OR NEW."discountAmount" <> OLD."discountAmount"
     OR NEW."lineTotal" <> OLD."lineTotal" OR NEW."unitCostSnapshot" <> OLD."unitCostSnapshot"
     OR NEW."productName" <> OLD."productName" THEN
    RAISE EXCEPTION 'KTS_IMMUTABLE: ligne de vente figée' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sale_items_guard BEFORE UPDATE ON sale_items FOR EACH ROW EXECUTE FUNCTION kts_sale_item_guard();

-- Paiement / remboursement : seules transitions permises = annulation motivée,
-- et rattachement d'un acompte de réservation à la vente issue de la conversion.
CREATE OR REPLACE FUNCTION kts_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference <> OLD.reference OR NEW.amount <> OLD.amount
     OR NEW."paymentMethodId" <> OLD."paymentMethodId" OR NEW."receivedAt" <> OLD."receivedAt"
     OR NEW."recordedById" <> OLD."recordedById"
     OR NEW."reservationId" IS DISTINCT FROM OLD."reservationId"
     OR (OLD."saleId" IS NOT NULL AND NEW."saleId" IS DISTINCT FROM OLD."saleId")
     OR (OLD.status = 'VOIDED') THEN
    RAISE EXCEPTION 'KTS_IMMUTABLE: paiement enregistré' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION kts_payment_guard();

CREATE OR REPLACE FUNCTION kts_refund_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference <> OLD.reference OR NEW.amount <> OLD.amount OR NEW."paymentId" <> OLD."paymentId"
     OR NEW."saleId" IS DISTINCT FROM OLD."saleId" OR NEW."refundedAt" <> OLD."refundedAt"
     OR OLD.status = 'VOIDED' THEN
    RAISE EXCEPTION 'KTS_IMMUTABLE: remboursement enregistré' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refunds_guard BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION kts_refund_guard();

-- Prix d'achat historiques intacts (marges).
CREATE OR REPLACE FUNCTION kts_purchase_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."unitCost" <> OLD."unitCost" OR NEW."landedUnitCost" <> OLD."landedUnitCost"
     OR NEW."quantityOrdered" <> OLD."quantityOrdered" OR NEW."productId" <> OLD."productId" THEN
    RAISE EXCEPTION 'KTS_IMMUTABLE: ligne d''achat figée' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchase_items_guard BEFORE UPDATE ON purchase_items FOR EACH ROW EXECUTE FUNCTION kts_purchase_item_guard();

-- ══════════════════════════════════════════════════════════════
-- Vues de lecture
-- ══════════════════════════════════════════════════════════════

-- Disponibilité par emplacement (formule de l'addendum 3 §E).
CREATE VIEW stock_availability AS
SELECT sl."productId", sl."locationId", loc.code AS "locationCode", loc.type AS "locationType",
       loc."isSellable",
       sl."onHand"                                   AS physical,
       sl.reserved,
       sl.allocated,
       sl."onHand" - sl.reserved - sl.allocated      AS available,
       CASE WHEN loc.type = 'TRANSIT' THEN sl."onHand" ELSE 0 END AS "inTransit",
       sl.quarantine,
       sl.damaged
FROM stock_levels sl
JOIN stock_locations loc ON loc.id = sl."locationId";

-- Statut de stock d'un produit, calculé : jamais stocké, donc jamais incohérent.
CREATE VIEW product_stock_status AS
SELECT p.id AS "productId",
       COALESCE(SUM(a.available) FILTER (WHERE a."isSellable"), 0)::int AS "stockQuantity",
       p."lowStockThreshold",
       p."isManuallyUnavailable",
       CASE
         WHEN COALESCE(SUM(a.available) FILTER (WHERE a."isSellable"), 0) = 0 THEN 'OUT_OF_STOCK'
         WHEN COALESCE(SUM(a.available) FILTER (WHERE a."isSellable"), 0) <= p."lowStockThreshold" THEN 'LOW_STOCK'
         ELSE 'IN_STOCK'
       END AS "stockStatus",
       CASE
         WHEN p."isManuallyUnavailable" THEN 'Indisponible'
         WHEN COALESCE(SUM(a.available) FILTER (WHERE a."isSellable"), 0) = 0 THEN 'Rupture de stock'
         WHEN COALESCE(SUM(a.available) FILTER (WHERE a."isSellable"), 0) <= p."lowStockThreshold" THEN 'Stock faible'
         ELSE 'Disponible'
       END AS "availabilityLabel"
FROM products p
LEFT JOIN stock_availability a ON a."productId" = p.id
GROUP BY p.id;

-- Situation financière d'une vente. netTotal tient compte des retours et de
-- l'annulation ; amountDue = ce que le client doit encore (négatif = à rembourser).
CREATE VIEW sale_balance AS
WITH returned AS (
  SELECT si."saleId", SUM(ri.quantity * si."lineTotal" / si.quantity) AS value
  FROM return_items ri JOIN sale_items si ON si.id = ri."saleItemId"
  GROUP BY si."saleId"
)
SELECT s.id AS "saleId", s.total,
       CASE WHEN s.status = 'CANCELLED' THEN 0
            ELSE s.total - COALESCE(r.value, 0) END::int                    AS "netTotal",
       COALESCE(pay.collected, 0)::int                                      AS collected,
       COALESCE(ref.refunded, 0)::int                                       AS refunded,
       ((CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE s.total - COALESCE(r.value, 0) END)
         - COALESCE(pay.collected, 0) + COALESCE(ref.refunded, 0))::int     AS "amountDue",
       CASE
         WHEN COALESCE(pay.collected, 0) - COALESCE(ref.refunded, 0) <= 0 THEN 'UNPAID'
         WHEN COALESCE(pay.collected, 0) - COALESCE(ref.refunded, 0)
              >= (CASE WHEN s.status = 'CANCELLED' THEN 0 ELSE s.total - COALESCE(r.value, 0) END) THEN 'PAID'
         ELSE 'PARTIALLY_PAID'
       END AS "paymentStatus"
FROM sales s
LEFT JOIN returned r ON r."saleId" = s.id
LEFT JOIN (SELECT "saleId", SUM(amount) AS collected FROM payments
           WHERE status = 'RECORDED' AND "saleId" IS NOT NULL GROUP BY "saleId") pay ON pay."saleId" = s.id
LEFT JOIN (SELECT "saleId", SUM(amount) AS refunded FROM refunds
           WHERE status = 'RECORDED' GROUP BY "saleId") ref ON ref."saleId" = s.id;

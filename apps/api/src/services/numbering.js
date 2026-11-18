// Numéros sans trou ni doublon : le compteur est incrémenté et lu dans la transaction
// de l'opération (verrou de ligne jusqu'au commit).
const PREFIX = {
  SALE: 'V', RESERVATION: 'R', PAYMENT: 'P', REFUND: 'RB', PURCHASE: 'A',
  RECEIPT: 'RC', TRANSFER: 'T', FULFILLMENT: 'L', RETURN: 'RT',
};

// Année civile à l'heure du Bénin (UTC+1).
const yearInBenin = (d = new Date()) =>
  Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Porto-Novo' }).format(d));

export async function nextNumber(tx, type, now = new Date()) {
  if (!PREFIX[type]) throw new Error(`Type de document inconnu : ${type}`);
  const year = yearInBenin(now);
  const [row] = await tx.$queryRaw`
    INSERT INTO document_counters (type, year, "lastValue") VALUES (${type}::"DocumentType", ${year}, 1)
    ON CONFLICT (type, year) DO UPDATE SET "lastValue" = document_counters."lastValue" + 1
    RETURNING "lastValue"`;
  return `${PREFIX[type]}-${year}-${String(row.lastValue).padStart(6, '0')}`;
}

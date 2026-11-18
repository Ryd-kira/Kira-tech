import { prisma } from '../lib/prisma.js';

// À appeler avec le client de transaction de l'opération : l'audit est validé ou annulé avec elle.
export function writeAudit(client, { adminUserId = null, action, entityType, entityId = null, oldValues, newValues, reason, ip }) {
  return (client ?? prisma).auditLog.create({
    data: { adminUserId, action, entityType, entityId, oldValues, newValues, reason, ip },
  });
}

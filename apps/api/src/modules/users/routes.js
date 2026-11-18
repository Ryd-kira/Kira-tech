import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError, errors } from '../../lib/errors.js';
import { hashPassword, passwordSchema } from '../../lib/passwords.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';
import { hashToken, revokeAllSessions } from '../../services/sessions.js';
import { publicAdminView } from '../auth/routes.js';

const RESET_TTL_MS = 30 * 60_000;
const role = z.enum(['SUPER_ADMIN', 'ADMIN', 'GESTIONNAIRE']);
const idParam = z.object({ id: z.uuid() });

const router = Router();
router.use(requirePermission('users:manage'));

async function loadUser(id) {
  const user = await prisma.adminUser.findUnique({ where: { id } });
  if (!user) throw errors.notFound('Compte');
  return user;
}

// Le dernier SUPER_ADMIN actif ne peut être ni désactivé ni rétrogradé.
async function assertNotLastSuperAdmin(tx, user) {
  if (user.role !== 'SUPER_ADMIN' || !user.isActive) return;
  const others = await tx.adminUser.count({
    where: { role: 'SUPER_ADMIN', isActive: true, NOT: { id: user.id } },
  });
  if (others === 0) {
    throw errors.conflict('LAST_SUPER_ADMIN', 'Il doit rester au moins un super administrateur actif.');
  }
}

router.get('/', async (req, res) => {
  const users = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ items: users.map(publicAdminView) });
});

router.post('/', async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2).max(100),
      email: z.email().max(254),
      role,
      temporaryPassword: passwordSchema,
    }).strict(),
    req.body,
  );
  const passwordHash = await hashPassword(data.temporaryPassword);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.adminUser.create({
      data: {
        name: data.name, email: data.email.toLowerCase(), role: data.role, passwordHash,
        mustChangePassword: true, createdById: req.admin.id,
      },
    });
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: 'user.create', entityType: 'AdminUser', entityId: created.id,
      newValues: { name: created.name, email: created.email, role: created.role }, ip: req.ip,
    });
    return created;
  });
  res.status(201).json(publicAdminView(user));
});

router.patch('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const data = parse(
    z.object({ name: z.string().trim().min(2).max(100).optional(), role: role.optional() })
      .strict()
      .refine((d) => Object.keys(d).length > 0, 'Aucune modification'),
    req.body,
  );
  const updated = await prisma.$transaction(async (tx) => {
    const user = await loadUser(id);
    if (data.role && data.role !== user.role) await assertNotLastSuperAdmin(tx, user);
    const next = await tx.adminUser.update({ where: { id }, data });
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: data.role && data.role !== user.role ? 'user.role.change' : 'user.update',
      entityType: 'AdminUser', entityId: id,
      oldValues: { name: user.name, role: user.role }, newValues: { name: next.name, role: next.role }, ip: req.ip,
    });
    return next;
  });
  res.json(publicAdminView(updated));
});

router.post('/:id/deactivate', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), req.body);
  if (id === req.admin.id) throw errors.conflict('SELF_DEACTIVATION', 'Vous ne pouvez pas désactiver votre propre compte.');
  const updated = await prisma.$transaction(async (tx) => {
    const user = await loadUser(id);
    if (!user.isActive) return user;
    await assertNotLastSuperAdmin(tx, user);
    const next = await tx.adminUser.update({ where: { id }, data: { isActive: false } });
    await revokeAllSessions(id, tx);
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'user.deactivate', entityType: 'AdminUser', entityId: id, reason, ip: req.ip });
    return next;
  });
  res.json(publicAdminView(updated));
});

router.post('/:id/reactivate', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const updated = await prisma.$transaction(async (tx) => {
    const user = await loadUser(id);
    if (user.isActive) return user;
    const next = await tx.adminUser.update({ where: { id }, data: { isActive: true, failedLoginCount: 0, lockedUntil: null } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'user.reactivate', entityType: 'AdminUser', entityId: id, ip: req.ip });
    return next;
  });
  res.json(publicAdminView(updated));
});

// Le lien n'est montré qu'une fois, au SUPER_ADMIN qui le transmet par un canal sûr.
router.post('/:id/reset-link', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const user = await loadUser(id);
  if (!user.isActive) throw errors.conflict('ACCOUNT_INACTIVE', "Réactivez d'abord ce compte.");
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({ where: { adminUserId: id, usedAt: null }, data: { usedAt: new Date() } });
    await tx.passwordResetToken.create({ data: { adminUserId: id, tokenHash: hashToken(token), issuedById: req.admin.id, expiresAt } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'user.reset_link.issue', entityType: 'AdminUser', entityId: id, ip: req.ip });
  });
  res.status(201).json({ url: `${env.APP_URL}/admin/reinitialiser#${token}`, expiresAt });
});

export default router;

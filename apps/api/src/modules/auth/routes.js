import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { permissionsOf } from '../../auth/permissions.js';
import { AppError } from '../../lib/errors.js';
import { DUMMY_HASH, hashPassword, passwordSchema, verifyPassword } from '../../lib/passwords.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';
import {
  COOKIE_NAME, cookieOptions, createSession, hashToken, revokeAllSessions, revokeSession,
} from '../../services/sessions.js';

const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60_000;
const INVALID = () => new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? '').toLowerCase()}`,
  handler: (req, res, next) =>
    next(new AppError(429, 'TOO_MANY_ATTEMPTS', 'Trop de tentatives. Réessayez dans quelques minutes.')),
});

export const publicAdminView = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive,
  mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
});

const router = Router();

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(
    z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict(),
    req.body,
  );
  const normalized = email.toLowerCase();
  const user = await prisma.adminUser.findUnique({ where: { email: normalized } });

  const locked = user?.lockedUntil && user.lockedUntil.getTime() > Date.now();
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !user.isActive || locked || !ok) {
    if (user && !locked && !ok) {
      const failed = user.failedLoginCount + 1;
      await prisma.adminUser.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILURES ? 0 : failed,
          lockedUntil: failed >= MAX_FAILURES ? new Date(Date.now() + LOCK_MS) : null,
        },
      });
    }
    await writeAudit(prisma, {
      adminUserId: user?.id ?? null, action: 'auth.login.failed', entityType: 'AdminUser',
      entityId: user?.id ?? null, newValues: { email: normalized, reason: locked ? 'locked' : 'invalid' }, ip: req.ip,
    });
    // Même réponse dans tous les cas : pas d'énumération des comptes.
    throw INVALID();
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  const token = await createSession(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
  await writeAudit(prisma, { adminUserId: user.id, action: 'auth.login', entityType: 'AdminUser', entityId: user.id, ip: req.ip });

  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ user: publicAdminView(user), permissions: permissionsOf(user.role) });
});

router.post('/logout', requireAuth, async (req, res) => {
  await revokeSession(req.session.id);
  await writeAudit(prisma, { adminUserId: req.admin.id, action: 'auth.logout', entityType: 'AdminUser', entityId: req.admin.id, ip: req.ip });
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicAdminView(req.admin), permissions: permissionsOf(req.admin.role) });
});

router.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(
    z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict(),
    req.body,
  );
  if (!(await verifyPassword(currentPassword, req.admin.passwordHash))) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Mot de passe actuel incorrect.');
  }
  if (currentPassword === newPassword) {
    throw new AppError(400, 'PASSWORD_UNCHANGED', 'Le nouveau mot de passe doit être différent.');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: req.admin.id }, data: { passwordHash, mustChangePassword: false } });
    // Toutes les autres sessions sont fermées ; la session courante reste ouverte.
    await tx.adminSession.updateMany({
      where: { adminUserId: req.admin.id, revokedAt: null, NOT: { id: req.session.id } },
      data: { revokedAt: new Date() },
    });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'auth.password.change', entityType: 'AdminUser', entityId: req.admin.id, ip: req.ip });
  });
  res.status(204).end();
});

// Réinitialisation par lien à usage unique émis par un SUPER_ADMIN.
router.post('/reset', loginLimiter, async (req, res) => {
  const { token, newPassword } = parse(
    z.object({ token: z.string().min(20).max(200), newPassword: passwordSchema }).strict(),
    req.body,
  );
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'Ce lien est invalide ou a expiré.');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    // Consommation atomique : un lien ne sert qu'une fois, même en cas de double envoi.
    const used = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null }, data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw new AppError(400, 'INVALID_RESET_TOKEN', 'Ce lien est invalide ou a expiré.');
    await tx.adminUser.update({
      where: { id: record.adminUserId },
      data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    });
    await revokeAllSessions(record.adminUserId, tx);
    await writeAudit(tx, { adminUserId: record.adminUserId, action: 'auth.password.reset', entityType: 'AdminUser', entityId: record.adminUserId, ip: req.ip });
  });
  res.status(204).end();
});

export default router;

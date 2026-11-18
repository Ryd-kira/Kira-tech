import { can } from '../auth/permissions.js';
import { errors, AppError } from '../lib/errors.js';
import { COOKIE_NAME, resolveSession } from '../services/sessions.js';

// Routes encore accessibles quand un changement de mot de passe est exigé.
const ALLOWED_WHEN_PASSWORD_CHANGE = new Set(['/api/v1/admin/auth/me', '/api/v1/admin/auth/password', '/api/v1/admin/auth/logout']);

export async function requireAuth(req, res, next) {
  try {
    const session = await resolveSession(req.cookies?.[COOKIE_NAME]);
    if (!session) throw errors.unauthenticated();
    req.session = session;
    req.admin = session.adminUser;
    if (req.admin.mustChangePassword && !ALLOWED_WHEN_PASSWORD_CHANGE.has(req.baseUrl + req.path)) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Vous devez changer votre mot de passe.');
    }
    next();
  } catch (err) {
    next(err);
  }
}

export const requirePermission = (permission) => (req, res, next) => {
  if (!req.admin || !can(req.admin.role, permission)) return next(errors.forbidden());
  next();
};

import { Router } from 'express';
import { z } from 'zod';
import {
  ALL, DEFAULT_PERMISSIONS, EDITABLE_ROLES, LOCKED, PERMISSION_CATALOG, overridesFor, permissionsOf, reloadPermissions,
} from '../../auth/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';

// Rôles et permissions : le super administrateur ajuste ce que voient et font
// les administrateurs et les gestionnaires. SUPER_ADMIN garde toujours tout.
const router = Router();
router.use(requirePermission('roles:manage'));

function view() {
  return {
    catalog: PERMISSION_CATALOG.map((p) => ({ ...p, locked: LOCKED.has(p.code) })),
    roles: Object.fromEntries(['SUPER_ADMIN', ...EDITABLE_ROLES].map((role) => [role, {
      editable: role !== 'SUPER_ADMIN',
      permissions: permissionsOf(role),
      defaults: [...DEFAULT_PERMISSIONS[role]].sort(),
    }])),
  };
}

router.get('/', async (req, res) => {
  await reloadPermissions();
  res.json(view());
});

router.put('/:role', async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(EDITABLE_ROLES) }), req.params);
  const { permissions } = parse(z.object({
    permissions: z.array(z.enum(ALL)).max(ALL.length)
      .refine((list) => list.every((p) => !LOCKED.has(p)), 'Cette permission reste réservée au super administrateur.'),
  }).strict(), req.body);

  await prisma.$transaction(async (tx) => {
    const before = permissionsOf(role);
    await tx.rolePermission.deleteMany({ where: { role } });
    const rows = overridesFor(role, permissions);
    if (rows.length) await tx.rolePermission.createMany({ data: rows.map((r) => ({ ...r, updatedById: req.admin.id })) });
    const after = [...new Set(permissions)].sort();
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: 'role.permissions.update', entityType: 'Role', entityId: role,
      oldValues: { permissions: before },
      newValues: { added: after.filter((p) => !before.includes(p)), removed: before.filter((p) => !after.includes(p)), permissions: after },
      ip: req.ip,
    });
  });
  await reloadPermissions();
  res.json(view());
});

export default router;

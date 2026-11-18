// Matrice validée le 18/11/2026 (architecture v1.2, section « Rôles et permissions »).
// Toute route admin vérifie une de ces permissions côté serveur. Refus par défaut.
const ALL = [
  'users:manage', 'audit:read',
  'settings:sensitive', 'settings:content',
  'products:write', 'products:price', 'categories:write',
  'stock:adjust', 'stock:read', 'transfers:write',
  'suppliers:write', 'purchases:write', 'purchases:receive',
  'reservations:write', 'sales:write', 'payments:write', 'payments:void', 'refunds:write',
  'fulfillments:write', 'returns:write', 'customers:write', 'messages:manage',
  'dashboard:stock', 'dashboard:commercial', 'dashboard:costs',
];

export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: new Set(ALL),
  ADMIN: new Set(ALL.filter((p) => !['users:manage', 'audit:read', 'settings:sensitive', 'payments:void'].includes(p))),
  GESTIONNAIRE: new Set([
    'products:write', 'stock:adjust', 'stock:read', 'transfers:write', 'purchases:receive', 'dashboard:stock',
  ]),
};

// Plafond de remise en pourcentage ; null = sans plafond. Les valeurs viennent de site_settings.
export function discountCeiling(role, settings) {
  if (role === 'SUPER_ADMIN') return null;
  if (role === 'ADMIN') return settings.maxDiscountPercentAdmin;
  return settings.maxDiscountPercentManager;
}

export function can(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function permissionsOf(role) {
  return [...(ROLE_PERMISSIONS[role] ?? [])].sort();
}

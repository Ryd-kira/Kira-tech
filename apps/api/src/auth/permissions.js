import { prisma } from '../lib/prisma.js';

// Matrice validée le 18/11/2026 (architecture v1.2, section « Rôles et permissions »),
// complétée le 20/11/2026 : le super administrateur peut accorder ou retirer des
// permissions aux rôles ADMIN et GESTIONNAIRE. Les valeurs ci-dessous sont les
// valeurs par défaut ; les écarts sont enregistrés dans la table role_permissions.
// Toute route admin vérifie une de ces permissions côté serveur. Refus par défaut.

// Catalogue : code, rubrique et libellé affichés dans l'écran « Rôles et permissions ».
export const PERMISSION_CATALOG = [
  { code: 'dashboard:commercial', group: 'Tableau de bord', label: "Chiffre d'affaires, ventes, encaissements" },
  { code: 'dashboard:stock', group: 'Tableau de bord', label: 'Indicateurs de stock' },
  { code: 'dashboard:costs', group: 'Tableau de bord', label: "Coûts d'achat et marges" },
  { code: 'products:write', group: 'Catalogue', label: 'Créer et modifier les produits' },
  { code: 'products:price', group: 'Catalogue', label: 'Modifier les prix' },
  { code: 'categories:write', group: 'Catalogue', label: 'Gérer les catégories' },
  { code: 'stock:read', group: 'Stocks', label: 'Consulter les stocks et mouvements' },
  { code: 'stock:adjust', group: 'Stocks', label: 'Ajuster le stock (inventaire, casse)' },
  { code: 'transfers:write', group: 'Stocks', label: 'Transferts entre emplacements' },
  { code: 'suppliers:write', group: 'Achats', label: 'Créer et modifier les fournisseurs' },
  { code: 'suppliers:delete', group: 'Achats', label: 'Supprimer un fournisseur sans historique' },
  { code: 'purchases:write', group: 'Achats', label: 'Passer des commandes fournisseur' },
  { code: 'purchases:receive', group: 'Achats', label: 'Réceptionner les livraisons' },
  { code: 'sales:write', group: 'Ventes', label: 'Caisse et ventes' },
  { code: 'reservations:write', group: 'Ventes', label: 'Réservations' },
  { code: 'payments:write', group: 'Ventes', label: 'Enregistrer des paiements' },
  { code: 'payments:void', group: 'Ventes', label: 'Annuler un paiement' },
  { code: 'refunds:write', group: 'Ventes', label: 'Remboursements' },
  { code: 'returns:write', group: 'Ventes', label: 'Retours et échanges' },
  { code: 'fulfillments:write', group: 'Ventes', label: 'Livraisons et retraits' },
  { code: 'customers:write', group: 'Clients', label: 'Créer et modifier les clients' },
  { code: 'customers:delete', group: 'Clients', label: 'Supprimer ou anonymiser un client' },
  { code: 'messages:manage', group: 'Site', label: 'Messages des visiteurs' },
  { code: 'settings:content', group: 'Site', label: 'Coordonnées, textes, bannière et accueil' },
  { code: 'branding:write', group: 'Site', label: 'Logos de la chaîne et des boutiques' },
  { code: 'stores:manage', group: 'Administration', label: 'Ajouter, désactiver ou supprimer une boutique' },
  { code: 'settings:sensitive', group: 'Administration', label: 'Règles commerciales (WhatsApp, remises, réservations)' },
  { code: 'audit:read', group: 'Administration', label: "Journal d'activité" },
  { code: 'users:manage', group: 'Administration', label: 'Comptes administrateurs' },
  { code: 'roles:manage', group: 'Administration', label: 'Rôles et permissions' },
];

export const ALL = PERMISSION_CATALOG.map((p) => p.code);

// Jamais accordables à un autre rôle que SUPER_ADMIN : sinon un compte pourrait
// s'attribuer lui-même des droits ou créer un super administrateur.
export const LOCKED = new Set(['users:manage', 'roles:manage']);

export const EDITABLE_ROLES = ['ADMIN', 'GESTIONNAIRE'];

export const DEFAULT_PERMISSIONS = {
  SUPER_ADMIN: new Set(ALL),
  ADMIN: new Set(ALL.filter((p) => ![
    'users:manage', 'roles:manage', 'audit:read', 'settings:sensitive', 'payments:void',
    'branding:write', 'stores:manage', 'customers:delete', 'suppliers:delete',
  ].includes(p))),
  GESTIONNAIRE: new Set([
    'products:write', 'stock:adjust', 'stock:read', 'transfers:write', 'purchases:receive', 'dashboard:stock',
  ]),
};

// Écarts par rapport aux valeurs par défaut, en mémoire. Rechargés depuis la base au plus
// toutes les CACHE_TTL_MS (plusieurs instances de l'API peuvent tourner) et immédiatement
// sur l'instance qui enregistre une modification.
const CACHE_TTL_MS = 15_000;
let effective = buildEffective([]);
let loadedAt = 0;
let loading = null;

function buildEffective(rows) {
  const out = {};
  for (const [role, defaults] of Object.entries(DEFAULT_PERMISSIONS)) {
    const set = new Set(defaults);
    if (role !== 'SUPER_ADMIN') {
      for (const r of rows) {
        if (r.role !== role || LOCKED.has(r.permission) || !ALL.includes(r.permission)) continue;
        if (r.granted) set.add(r.permission);
        else set.delete(r.permission);
      }
    }
    out[role] = set;
  }
  return out;
}

export async function reloadPermissions(client = prisma) {
  const rows = await client.rolePermission.findMany({ select: { role: true, permission: true, granted: true } });
  effective = buildEffective(rows);
  loadedAt = Date.now();
}

// Appelé par requireAuth avant chaque requête admin : coût nul tant que le cache est frais.
export async function ensurePermissionsFresh() {
  if (Date.now() - loadedAt < CACHE_TTL_MS) return;
  loading ??= reloadPermissions().finally(() => { loading = null; });
  await loading;
}

// Plafond de remise en pourcentage ; null = sans plafond. Les valeurs viennent de site_settings.
export function discountCeiling(role, settings) {
  if (role === 'SUPER_ADMIN') return null;
  if (role === 'ADMIN') return settings.maxDiscountPercentAdmin;
  return settings.maxDiscountPercentManager;
}

export function can(role, permission) {
  return effective[role]?.has(permission) ?? false;
}

export function permissionsOf(role) {
  return [...(effective[role] ?? [])].sort();
}

// Lignes à enregistrer pour qu'un rôle ait exactement `wanted` : seuls les écarts sont stockés.
export function overridesFor(role, wanted) {
  const defaults = DEFAULT_PERMISSIONS[role];
  const want = new Set(wanted.filter((p) => !LOCKED.has(p)));
  return ALL.filter((p) => !LOCKED.has(p) && want.has(p) !== defaults.has(p))
    .map((permission) => ({ role, permission, granted: want.has(permission) }));
}

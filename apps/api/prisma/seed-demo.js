// DONNÉES DE DÉMONSTRATION pour le développement local uniquement.
// Produits et prix fictifs : refusé en production, jamais à utiliser comme catalogue réel.
import { PrismaClient } from '@prisma/client';
import { applyStockChanges } from '../src/services/stockLedger.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo refusé en production.');
  process.exit(1);
}
const prisma = new PrismaClient();

const demo = [
  ['ordinateurs-portables', 'HP', 'HP EliteBook 840 G6', 'USED', 16, 512, 'SSD', 'Core i5-8365U', 245000, true, 'INTERMEDIATE', ['bureautique', 'etudes', 'programmation'], 6],
  ['ordinateurs-portables', 'Lenovo', 'Lenovo IdeaPad Slim 3 15', 'NEW', 8, 512, 'SSD', 'Ryzen 5 7520U', 325000, true, 'INTERMEDIATE', ['bureautique', 'etudes'], 2],
  ['ordinateurs-portables', 'Dell', 'Dell Latitude 5420', 'USED', 16, 256, 'SSD', 'Core i7-1185G7', 285000, false, 'ADVANCED', ['programmation', 'cybersecurite'], 4],
  ['pc-gaming', 'ASUS', 'ASUS TUF Gaming A15', 'NEW', 16, 1024, 'SSD', 'Ryzen 7 7735HS', 785000, true, 'GAMING', ['graphisme'], 0],
  ['ordinateurs-de-bureau', 'Dell', 'Dell OptiPlex 7090 Tour', 'USED', 8, 256, 'SSD', 'Core i5-10500', 185000, true, 'BASIC', ['bureautique'], 7],
  ['ordinateurs-portables', 'Apple', 'MacBook Air 13 M1', 'USED', 8, 256, 'SSD', 'Apple M1', 450000, true, 'ADVANCED', ['graphisme', 'programmation'], 1],
];

async function main() {
  const store = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'COTONOU' } });
  const admin = await prisma.adminUser.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!admin) throw new Error('Créez d’abord un super administrateur (npm run admin:create).');
  for (const [i, [cat, brand, name, condition, ram, sto, stype, cpu, price, showPrice, perf, usages, qty]] of demo.entries()) {
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: cat } });
    const tags = await prisma.usageTag.findMany({ where: { slug: { in: usages } } });
    const p = await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        slug, sku: `DEMO-${String(i + 1).padStart(3, '0')}`, name, brand, categoryId: category.id, condition, status: 'PUBLISHED',
        description: 'Produit de démonstration (données fictives).', processor: cpu, ramGb: ram, storageGb: sto, storageType: stype,
        screenSizeInch: cat === 'ordinateurs-de-bureau' ? null : 15.6, resolution: '1920 × 1080', operatingSystem: 'Windows 11',
        performanceLevel: perf, warrantyMonths: condition === 'NEW' ? 12 : 3, price, showPrice, lowStockThreshold: 2,
        usages: { create: tags.map((t) => ({ usageTagId: t.id })) },
      },
    });
    // Même les données de démonstration passent par le grand livre : chaque quantité a son mouvement.
    const exists = await prisma.stockMovement.count({ where: { productId: p.id } });
    if (!exists && qty > 0) {
      await prisma.$transaction((tx) => applyStockChanges(tx, { type: 'ADJUSTMENT_IN', adminUserId: admin.id, reason: 'Données de démonstration' },
        [{ productId: p.id, locationId: store.id, bucket: 'ON_HAND', delta: qty }]));
    }
  }
  await prisma.siteSetting.update({ where: { id: 1 }, data: { whatsappNumber: '+22900000000' } });
  console.log('Données de démonstration créées (fictives).');
}
main().finally(() => prisma.$disconnect());

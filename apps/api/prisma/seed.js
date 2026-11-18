// Référentiels de départ. Idempotent : peut être relancé sans créer de doublon.
// Aucune donnée commerciale fictive (produits, prix, coordonnées) n'est créée ici.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const locations = [
  { code: 'COTONOU', name: 'Boutique de Cotonou', type: 'STORE', city: 'Cotonou', isSellable: true },
  { code: 'CALAVI', name: 'Boutique de Calavi', type: 'STORE', city: 'Abomey-Calavi', isSellable: true },
  { code: 'TRANSIT', name: 'En transit', type: 'TRANSIT', isSellable: false },
];
const paymentMethods = [
  ['CASH', 'Espèces'], ['MOBILE_MONEY', 'Mobile Money'], ['BANK_TRANSFER', 'Virement bancaire'],
  ['CARD', 'Carte bancaire'], ['OTHER', 'Autre'],
];
const usageTags = [
  ['bureautique', 'Bureautique'], ['etudes', 'Études'], ['programmation', 'Programmation'],
  ['graphisme', 'Graphisme'], ['cybersecurite', 'Cybersécurité'],
];
const categories = [
  ['Ordinateurs portables', 'ordinateurs-portables'], ['Ordinateurs de bureau', 'ordinateurs-de-bureau'],
  ['PC Gaming', 'pc-gaming'], ['Composants', 'composants'], ['Accessoires', 'accessoires'],
];

async function main() {
  await prisma.siteSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  for (const l of locations) await prisma.stockLocation.upsert({ where: { code: l.code }, update: {}, create: l });
  for (const [i, [code, label]] of paymentMethods.entries()) {
    await prisma.paymentMethod.upsert({ where: { code }, update: {}, create: { code, label, sortOrder: i } });
  }
  for (const [i, [slug, label]] of usageTags.entries()) {
    await prisma.usageTag.upsert({ where: { slug }, update: {}, create: { slug, label, sortOrder: i } });
  }
  for (const [i, [name, slug]] of categories.entries()) {
    await prisma.category.upsert({ where: { slug }, update: {}, create: { name, slug, sortOrder: i } });
  }
  console.log('Référentiels en place.');
}

main().finally(() => prisma.$disconnect());

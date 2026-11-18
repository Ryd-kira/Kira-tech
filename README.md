# Kira Tech et Solution

Site commercial et back-office de gestion commerciale.

| Dossier | Contenu | Hébergement |
| --- | --- | --- |
| `apps/api` | API REST Node.js + Express, Prisma, PostgreSQL | Render + Neon |
| `apps/web` | Site public (et administration à venir) React + Vite + Tailwind | Vercel |
| `docs/` | Documentation technique | |

L'architecture validée (v1.2, 18/11/2026) est le document « Kira Tech et Solution : architecture MVP v1.2 ».

## Démarrer l'API en local

Prérequis : Node.js 22, PostgreSQL 16.

```bash
cd apps/api
cp .env.example .env          # renseigner DATABASE_URL et DIRECT_URL
npm install
npx prisma migrate deploy     # crée les tables, contraintes, triggers et vues
npm run db:seed               # emplacements, moyens de paiement, usages, catégories
npm run admin:create          # premier super administrateur (saisie interactive)
npm run dev                   # http://localhost:4000/health
```

## Démarrer le site en local

```bash
cd apps/web
npm install
npm run dev                   # http://localhost:5173 (les appels /api vont vers l'API sur le port 4000)
```

Pour voir le site avec un catalogue, une base locale peut recevoir des produits fictifs :
`node prisma/seed-demo.js` dans `apps/api` (refusé si `NODE_ENV=production`).

## Administration

L'espace d'administration est sur `/admin` (même application que le site, chargée à part).
Le premier compte se crée avec `npm run admin:create` (voir `docs/premier-super-admin.md`).

Photos : renseigner `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` et `CLOUDINARY_API_SECRET` dans
l'environnement de l'API. Sans ces variables, l'administration l'indique clairement et le reste fonctionne.

## Tests

Sur une base vide dédiée (jamais la base de production) :

```bash
cp .env.example .env.test     # pointer vers la base de test, NODE_ENV=test
npx prisma migrate deploy && npm run db:seed
npm test
```

## Règles du projet

- Les secrets ne sont jamais commités : uniquement dans les variables d'environnement Render et Vercel.
- Toute modification de stock passe par le service de grand livre, avec son mouvement, dans une transaction.
- Les historiques (mouvements, audit, ventes validées, paiements) ne se modifient pas : on corrige par une opération compensatoire. La base le garantit.

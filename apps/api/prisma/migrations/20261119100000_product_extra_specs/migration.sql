-- AlterTable : colonnes ajoutées sans toucher aux données existantes (aucune perte, produits actuels inchangés)
ALTER TABLE "products" ADD COLUMN     "batteryNote" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "conditionNote" TEXT,
ADD COLUMN     "extraSpecs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "isTouchscreen" BOOLEAN NOT NULL DEFAULT false;

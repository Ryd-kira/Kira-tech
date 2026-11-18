-- CreateEnum
CREATE TYPE "ServiceIcon" AS ENUM ('WRENCH', 'CPU', 'PHONE', 'SEARCH', 'CHAT');

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "aboutText" TEXT,
ADD COLUMN     "servicesIntro" TEXT;

-- AlterTable
ALTER TABLE "stock_locations" ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "site_services" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" "ServiceIcon" NOT NULL DEFAULT 'WRENCH',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_services_isActive_sortOrder_idx" ON "site_services"("isActive", "sortOrder");


-- Invariants : textes non vides et de taille raisonnable (le service applique les mêmes bornes).
ALTER TABLE "site_services"
  ADD CONSTRAINT "site_services_title_len" CHECK (char_length(btrim("title")) BETWEEN 2 AND 120),
  ADD CONSTRAINT "site_services_description_len" CHECK (char_length(btrim("description")) BETWEEN 2 AND 1000);
ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_about_len" CHECK ("aboutText" IS NULL OR char_length("aboutText") <= 6000),
  ADD CONSTRAINT "site_settings_services_intro_len" CHECK ("servicesIntro" IS NULL OR char_length("servicesIntro") <= 600);

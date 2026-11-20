-- Logos, bannière et mise en page de l'accueil, permissions ajustables par rôle.

-- CreateEnum
CREATE TYPE "HomeLayout" AS ENUM ('CLASSIC', 'SHOWCASE');

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "chainLogoUrl" TEXT,
ADD COLUMN     "chainLogoPublicId" TEXT,
ADD COLUMN     "homeLayout" "HomeLayout" NOT NULL DEFAULT 'CLASSIC',
ADD COLUMN     "bannerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bannerTitle" TEXT,
ADD COLUMN     "bannerText" TEXT,
ADD COLUMN     "bannerCtaLabel" TEXT,
ADD COLUMN     "bannerCtaUrl" TEXT,
ADD COLUMN     "bannerImageUrl" TEXT,
ADD COLUMN     "bannerImagePublicId" TEXT,
ADD COLUMN     "bannerImageWidth" INTEGER,
ADD COLUMN     "bannerImageHeight" INTEGER;

-- AlterTable
ALTER TABLE "stock_locations" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "logoPublicId" TEXT;

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" "AdminRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permission")
);

-- CreateIndex
CREATE INDEX "role_permissions_updatedById_idx" ON "role_permissions"("updatedById");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants : SUPER_ADMIN n'a jamais d'écart (il garde toutes les permissions),
-- les permissions de gestion des comptes et des rôles ne sont jamais déléguées.
ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_not_super_admin" CHECK ("role" <> 'SUPER_ADMIN'),
  ADD CONSTRAINT "role_permissions_not_locked" CHECK ("permission" NOT IN ('users:manage', 'roles:manage'));

-- Bannière : textes de taille raisonnable (le service applique les mêmes bornes) ;
-- une bannière active a au moins un titre.
ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_banner_title_len" CHECK ("bannerTitle" IS NULL OR char_length("bannerTitle") <= 120),
  ADD CONSTRAINT "site_settings_banner_text_len" CHECK ("bannerText" IS NULL OR char_length("bannerText") <= 400),
  ADD CONSTRAINT "site_settings_banner_cta_len" CHECK ("bannerCtaLabel" IS NULL OR char_length("bannerCtaLabel") <= 40),
  ADD CONSTRAINT "site_settings_banner_active_title" CHECK (NOT "bannerEnabled" OR "bannerTitle" IS NOT NULL);

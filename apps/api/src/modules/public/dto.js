// Réponses publiques construites champ par champ : jamais l'objet Prisma complet.
// Jamais exposés : coût moyen, prix masqué, quantités physiques, emplacements, séries.

const cloudinaryUrl = (url, width) =>
  url.includes('/upload/') ? url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${width}/`) : url;

export function imageView(img, width = 800) {
  if (!img) return null;
  return { url: cloudinaryUrl(img.url, width), width: img.width, height: img.height, alt: img.alt };
}

export function availabilityView(status, settings) {
  const s = status ?? { stockStatus: 'OUT_OF_STOCK', availabilityLabel: 'Rupture de stock', stockQuantity: 0, isManuallyUnavailable: false };
  const code = s.isManuallyUnavailable ? 'UNAVAILABLE' : s.stockStatus;
  const view = { status: code, label: s.availabilityLabel };
  if (settings.publicStockDisplay === 'LABEL_AND_QUANTITY' && code !== 'UNAVAILABLE') view.quantity = s.stockQuantity;
  return view;
}

export function productCardView(p, status, settings) {
  return {
    slug: p.slug,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    condition: p.condition,
    category: { name: p.category.name, slug: p.category.slug },
    processor: p.processor,
    ramGb: p.ramGb,
    storageGb: p.storageGb,
    storageType: p.storageType,
    gpu: p.gpu,
    screenSizeInch: p.screenSizeInch == null ? null : Number(p.screenSizeInch),
    performanceLevel: p.performanceLevel,
    color: p.color,
    isTouchscreen: p.isTouchscreen,
    usages: p.usages.map((u) => ({ slug: u.usageTag.slug, label: u.usageTag.label })),
    // Prix masqué : le champ est absent, pas seulement vide.
    ...(p.showPrice ? { price: p.price } : {}),
    priceOnRequest: !p.showPrice,
    availability: availabilityView(status, settings),
    image: imageView(p.images[0], 640),
    isFeatured: p.isFeatured,
    createdAt: p.createdAt,
  };
}

export function productDetailView(p, status, settings) {
  return {
    ...productCardView(p, status, settings),
    description: p.description,
    resolution: p.resolution,
    operatingSystem: p.operatingSystem,
    warrantyMonths: p.warrantyMonths,
    conditionNote: p.conditionNote,
    batteryNote: p.batteryNote,
    extraSpecs: p.extraSpecs,
    images: p.images.map((img) => imageView(img, 1200)),
  };
}

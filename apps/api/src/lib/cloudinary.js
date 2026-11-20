import { createHash } from 'node:crypto';

// Intégration Cloudinary sans SDK : signature des envois et suppression, côté serveur uniquement.
// Le secret ne quitte jamais l'API.
// Un dossier par usage : photos produits, et identité visuelle (logos, bannière).
export const FOLDERS = { products: 'kira-tech/products', branding: 'kira-tech/branding' };
const FOLDER = FOLDERS.products;

export function cloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

// Algorithme de signature Cloudinary : paramètres triés, joints par &, suivis du secret, SHA-1.
export function sign(params, apiSecret) {
  const payload = Object.keys(params).sort()
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha1').update(payload + apiSecret).digest('hex');
}

export function uploadSignature(cfg, now = Date.now(), folder = FOLDER) {
  const params = {
    folder,
    timestamp: Math.floor(now / 1000),
    allowed_formats: 'jpg,jpeg,png,webp',
  };
  return {
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
    params: { ...params, signature: sign(params, cfg.apiSecret), api_key: cfg.apiKey },
  };
}

// Seuls les fichiers déposés dans notre dossier peuvent être rattachés à un produit.
export const isOwnPublicId = (publicId, folder = FOLDER) =>
  typeof publicId === 'string' && publicId.startsWith(`${folder}/`) && /^[A-Za-z0-9/_-]+$/.test(publicId) && !publicId.includes('..');

export const deliveryUrl = (cfg, publicId, version, format) =>
  `https://res.cloudinary.com/${cfg.cloudName}/image/upload/v${version}/${publicId}.${format}`;

export async function destroy(cfg, publicId) {
  const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), invalidate: 'true' };
  const body = new URLSearchParams({ ...params, signature: sign(params, cfg.apiSecret), api_key: cfg.apiKey });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/destroy`, {
    method: 'POST', body, signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Cloudinary destroy ${res.status}`);
  return res.json();
}

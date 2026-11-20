import { api } from '../lib/api.js';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Contrôle avant envoi : un message clair plutôt qu'un refus de Cloudinary.
export function checkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return `${file.name} : format accepté JPG, PNG ou WebP.`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name} : 8 Mo maximum.`;
  return null;
}

// Envoi direct navigateur -> Cloudinary avec une signature de l'API (le secret reste sur le serveur).
// Renvoie la description de l'image à transmettre à l'API qui l'enregistre.
export async function uploadBrandingImage(purpose, file) {
  const sig = await api('/admin/settings/branding/signature', { method: 'POST', body: { purpose } });
  const form = new FormData();
  Object.entries(sig.params).forEach(([k, v]) => form.append(k, v));
  form.append('file', file);
  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ? `Cloudinary : ${data.error.message}` : "L'envoi de l'image a échoué.");
  return { publicId: data.public_id, version: data.version, format: data.format, width: data.width, height: data.height };
}

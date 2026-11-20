const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

// Espaces simples (et non insécables fines) pour un rendu identique partout.
export const formatAmount = (n) => nf.format(n).replace(/[  ]/g, ' ');
export const formatFCFA = (n) => `${formatAmount(n)} FCFA`;

export function storageParts(gb) {
  if (gb == null) return null;
  return gb >= 1024 && gb % 1024 === 0 ? { value: String(gb / 1024), unit: 'To' } : { value: String(gb), unit: 'Go' };
}
export const storageLabel = (gb) => {
  const p = storageParts(gb);
  return p ? `${p.value} ${p.unit}` : null;
};
export const conditionLabel = (c) => (c === 'NEW' ? 'Neuf' : 'Occasion');
export const PERFORMANCE = { BASIC: 'Basique', INTERMEDIATE: 'Intermédiaire', ADVANCED: 'Avancée', GAMING: 'Gaming' };
export const screenLabel = (inch) => (inch == null ? null : `${String(inch).replace('.', ',')} pouces`);

// Texte saisi dans l'administration : un paragraphe par bloc séparé d'une ligne vide.
export const paragraphs = (text) => (text ? text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean) : []);

// Logo Cloudinary à la hauteur affichée (x2 pour les écrans haute densité).
export const logoSrc = (url, height) => url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,h_${height * 2}/`);

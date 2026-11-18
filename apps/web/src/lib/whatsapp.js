import { formatFCFA } from './format.js';

// Message prérempli exigé par le briefing : nom, référence, prix, demande de disponibilité.
export function productMessage(product) {
  const price = product.priceOnRequest || product.price == null ? 'au prix sur demande' : `affiché à ${formatFCFA(product.price)}`;
  return `Bonjour, je suis intéressé par le ${product.name} (réf. ${product.sku}) ${price}. Est-il toujours disponible ?`;
}

// Renvoie null si le numéro n'est pas encore configuré : l'interface propose alors la page contact.
export function whatsappUrl(number, message) {
  const digits = String(number ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

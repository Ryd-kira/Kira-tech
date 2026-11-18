import { describe, expect, it } from 'vitest';
import { formatFCFA, storageLabel } from './format.js';
import { productMessage, whatsappUrl } from './whatsapp.js';

describe('WhatsApp', () => {
  const p = { name: 'Lenovo IdeaPad Slim 3', sku: 'LEN-IPS3', price: 325000, priceOnRequest: false };
  it('inclut nom, référence, prix et demande de disponibilité', () => {
    const m = productMessage(p);
    expect(m).toContain('Lenovo IdeaPad Slim 3');
    expect(m).toContain('LEN-IPS3');
    expect(m).toContain('325 000 FCFA');
    expect(m).toContain('disponible');
  });
  it("n'invente pas de prix quand il est masqué", () => {
    const m = productMessage({ ...p, price: undefined, priceOnRequest: true });
    expect(m).toContain('prix sur demande');
    expect(m).not.toMatch(/\d{3} \d{3}/);
  });
  it('construit un lien wa.me encodé, ou rien sans numéro', () => {
    expect(whatsappUrl('+229 01 97 00 00 00', 'a b')).toBe('https://wa.me/2290197000000?text=a%20b');
    expect(whatsappUrl(null, 'x')).toBeNull();
  });
  it('formate les montants et le stockage', () => {
    expect(formatFCFA(1250000)).toBe('1 250 000 FCFA');
    expect(storageLabel(1024)).toBe('1 To');
    expect(storageLabel(512)).toBe('512 Go');
  });
});

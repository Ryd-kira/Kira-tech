import { describe, expect, it } from 'vitest';
import { applyFiche, parseFiche } from './parseFiche.js';

const SURFACE = `💻 Microsoft Surface Pro (Hybride 2-en-1),  Core i7 – 11ème génération

⚡ Intel® Core™ i7-1185G7 – jusqu'à 4.80 GHz Turbo
🔹 4 cœurs et 8 processeurs logiques
🖥️ Écran tactile PixelSense haute résolution
🎨 Couleur : Platine (gris argenté)
🧠 RAM 16Go LPDDR4x
💾 SSD 256Go amovible
🎮 Intel® Iris® Xe Graphics
⌨️ Clavier Type Cover détachable et rétroéclairé
🤳 Reconnaissance faciale Windows Hello
📷 Caméras avant et arrière
🔄 Format hybride 2-en-1 avec pied intégré inclinable
⚙️ Windows 10/11 Pro 64 bits
✨ État : Occasion très propre
🚀 Performante pour la bureautique avancée, le multitâche, la retouche photo et les travaux professionnels
🔋 Autonomie : Très bonne`;

describe('parseFiche', () => {
  const r = parseFiche(SURFACE);
  it('reconnaît les champs structurés', () => {
    expect(r.fields).toMatchObject({
      name: 'Microsoft Surface Pro', brand: 'Microsoft', condition: 'USED', conditionNote: 'Très propre',
      color: 'Platine (gris argenté)', ramGb: 16, storageGb: 256, storageType: 'SSD', isTouchscreen: true,
      gpu: 'Intel Iris Xe Graphics', operatingSystem: 'Windows 10/11 Pro 64 bits', batteryNote: 'Très bonne',
    });
    expect(r.fields.processor).toContain('i7-1185G7');
    expect(r.fields.usageSlugs).toEqual(['bureautique', 'graphisme']);
  });
  it('range le reste en caractéristiques supplémentaires', () => {
    const map = Object.fromEntries(r.extraSpecs.map((s) => [s.label, s.value]));
    expect(map['Cœurs / threads']).toBe('4 cœurs / 8 threads');
    expect(map['Type de mémoire']).toBe('LPDDR4x');
    expect(map.Stockage).toBe('SSD amovible');
    expect(map.Clavier).toBe('Type Cover détachable et rétroéclairé');
    expect(map['Sécurité']).toBe('Reconnaissance faciale Windows Hello');
    expect(map['Caméras']).toBe('Avant et arrière');
    expect(map.Format).toBe('Hybride 2-en-1 avec pied intégré inclinable');
  });
  it('ne devine ni la taille d’écran ni le niveau de performance', () => {
    expect(r.fields.screenSizeInch).toBeUndefined();
    expect(r.fields.performanceLevel).toBeUndefined();
    expect(r.unmatched).toEqual([]);
  });
  it('signale les lignes inconnues', () => {
    expect(parseFiche('Dell Latitude\nGarantie constructeur ok').unmatched).toEqual(['Garantie constructeur ok']);
  });
  it('convertit les To en Go', () => {
    expect(parseFiche('HP Probook\nSSD NVMe 1 To').fields).toMatchObject({ storageGb: 1024, storageType: 'NVMe' });
  });
});

describe('applyFiche', () => {
  it('n’écrase pas un champ déjà rempli', () => {
    const form = { name: 'Mon nom', brand: '', condition: 'NEW', extraSpecs: [{ label: 'Clavier', value: 'AZERTY' }], usageSlugs: [] };
    const out = applyFiche(form, parseFiche(SURFACE));
    expect(out.name).toBe('Mon nom');
    expect(out.brand).toBe('Microsoft');
    expect(out.condition).toBe('USED');
    expect(out.extraSpecs.filter((s) => s.label === 'Clavier')).toEqual([{ label: 'Clavier', value: 'AZERTY' }]);
  });
});

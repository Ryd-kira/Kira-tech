// Analyse une fiche produit collée (texte libre, une caractéristique par ligne, emojis possibles).
// Règle : on ne déduit rien. Une ligne non reconnue est signalée, jamais devinée.
// Le résultat est une proposition affichée à l'administrateur avant d'être appliquée au formulaire.

const BRANDS = ['Microsoft', 'HP', 'Dell', 'Lenovo', 'Asus', 'Acer', 'Apple', 'MSI', 'Samsung', 'Toshiba', 'Huawei', 'Razer', 'Gigabyte'];
const USAGE_KEYWORDS = [
  ['bureautique', /bureautique/i],
  ['graphisme', /retouche|graphi|design|infographie/i],
  ['etudes', /[ée]tud|scolaire|universit/i],
  ['programmation', /programm|d[ée]velopp/i],
  ['cybersecurite', /cybers[ée]curit/i],
];

const clean = (line) => line
  .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
  .replace(/[®™]/g, '')
  .replace(/^[\s\-•*·▪►✓✔]+/, '')
  .replace(/\s+/g, ' ')
  .trim();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const after = (line, re) => cap(line.replace(re, '').replace(/^[\s:–-]+/, '').trim());

export function parseFiche(text) {
  const fields = {};
  const extras = new Map();
  const unmatched = [];
  const lines = String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean);
  if (!lines.length) return { fields, extraSpecs: [], unmatched };

  // Première ligne : titre. « Microsoft Surface Pro (Hybride 2-en-1), Core i7 » -> nom, marque, format.
  const title = lines.shift();
  const fmt = title.match(/\(([^)]*(?:2[- ]?en[- ]?1|hybride)[^)]*)\)/i);
  if (fmt) extras.set('Format', cap(fmt[1].trim()));
  const name = title.replace(/\([^)]*\)/g, '').split(',')[0].replace(/\s+/g, ' ').trim();
  if (name) fields.name = name;
  const brand = BRANDS.find((b) => new RegExp(`^${b}\\b`, 'i').test(name));
  if (brand) fields.brand = brand;

  for (const line of lines) {
    let m;
    if ((m = line.match(/^couleur\s*:?\s*(.+)$/i))) fields.color = cap(m[1].trim());
    else if ((m = line.match(/^[eé]tat\s*:?\s*(.+)$/i))) {
      const v = m[1].trim();
      if (/occasion|reconditionn/i.test(v)) {
        fields.condition = 'USED';
        const note = v.replace(/^(occasion|reconditionn[ée]e?s?)\s*/i, '').trim();
        if (note) fields.conditionNote = cap(note);
      } else if (/neuf/i.test(v)) fields.condition = 'NEW';
      else unmatched.push(line);
    } else if ((m = line.match(/^autonomie\s*:?\s*(.+)$/i))) fields.batteryNote = cap(m[1].trim());
    else if (/\b(core|ryzen|celeron|pentium|athlon|xeon|snapdragon)\b|\bapple m\d/i.test(line)) fields.processor = line.slice(0, 120);
    else if ((m = line.match(/(\d+)\s*c(?:œ|oe)urs?\b.*?(\d+)\s*(?:processeurs logiques|threads)/i))) extras.set('Cœurs / threads', `${m[1]} cœurs / ${m[2]} threads`);
    else if (/[ée]cran|tactile|pouces|pixelsense/i.test(line)) {
      if (/tactile/i.test(line)) fields.isTouchscreen = true;
      const inch = line.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:pouces?|"|″)/i);
      if (inch) fields.screenSizeInch = Number(inch[1].replace(',', '.'));
      const res = line.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/i);
      if (res) fields.resolution = `${res[1]} × ${res[2]}`;
      const detail = after(line, /^[ée]cran\s*/i);
      if (detail && !inch && !res) extras.set('Écran', detail);
      else if (detail && !/^\d/.test(detail)) extras.set('Écran', detail);
    } else if (/\b(ram|m[ée]moire|lpddr\d?x?|ddr\d)\b/i.test(line) && (m = line.match(/(\d+)\s*(?:go|gb)\b/i))) {
      fields.ramGb = Number(m[1]);
      const type = line.match(/\b(lpddr\d?x?|ddr\d)\b/i);
      if (type) extras.set('Type de mémoire', type[1].replace(/^lpddr/i, 'LPDDR').replace(/^ddr/i, 'DDR'));
    } else if (/\b(ssd|hdd|nvme|emmc)\b/i.test(line) && (m = line.match(/(\d+(?:[.,]\d+)?)\s*(go|gb|to|tb)\b/i))) {
      const n = Number(m[1].replace(',', '.'));
      fields.storageGb = /^(to|tb)$/i.test(m[2]) ? Math.round(n * 1024) : n;
      const t = (line.match(/\bnvme\b/i) || line.match(/\b(ssd|hdd|emmc)\b/i))[0];
      fields.storageType = t.toUpperCase() === 'NVME' ? 'NVMe' : t.toUpperCase() === 'EMMC' ? 'eMMC' : t.toUpperCase();
      if (/amovible|removable/i.test(line)) extras.set('Stockage', `${fields.storageType} amovible`);
    } else if (/\b(graphics|radeon|geforce|rtx|gtx|iris|uhd|quadro)\b/i.test(line)) fields.gpu = after(line, /^carte graphique\s*/i).slice(0, 120);
    else if (/clavier/i.test(line)) extras.set('Clavier', after(line, /^clavier\s*/i));
    else if (/reconnaissance faciale|empreinte|windows hello/i.test(line)) extras.set('Sécurité', line);
    else if (/cam[ée]ras?|webcam/i.test(line)) extras.set('Caméras', after(line, /^cam[ée]ras?\s*/i) || line);
    else if (/\b(windows|macos|linux|ubuntu|chrome ?os|android)\b/i.test(line)) fields.operatingSystem = line.slice(0, 60);
    else if (/hybride|2[- ]?en[- ]?1|^format\b/i.test(line)) extras.set('Format', after(line, /^format\s*/i));
    else if (/^(performant|id[ée]al|parfait|con[cç]u|recommand)/i.test(line)) {
      fields.description = line;
      const slugs = USAGE_KEYWORDS.filter(([, re]) => re.test(line)).map(([slug]) => slug);
      if (slugs.length) fields.usageSlugs = slugs;
    } else unmatched.push(line);
  }

  return { fields, extraSpecs: [...extras].map(([label, value]) => ({ label, value })), unmatched };
}

// Fusion dans un formulaire existant : les champs déjà remplis ne sont pas écrasés,
// sauf l'état et le type de stockage, qui ont une valeur par défaut.
const OVERWRITABLE = new Set(['condition', 'storageType']);
const isEmpty = (v) => v === '' || v == null || (Array.isArray(v) && v.length === 0) || v === false;

export function applyFiche(form, parsed) {
  const next = { ...form };
  for (const [k, v] of Object.entries(parsed.fields)) {
    if (OVERWRITABLE.has(k) || isEmpty(next[k])) next[k] = v;
  }
  const known = new Set((form.extraSpecs ?? []).map((s) => s.label.trim().toLowerCase()));
  next.extraSpecs = [...(form.extraSpecs ?? []), ...parsed.extraSpecs.filter((s) => !known.has(s.label.toLowerCase()))].slice(0, 20);
  return next;
}

export const FIELD_LABELS = {
  name: 'Nom', brand: 'Marque', condition: 'État', conditionNote: 'Précision sur l’état', color: 'Couleur',
  processor: 'Processeur', ramGb: 'Mémoire vive (Go)', storageGb: 'Stockage (Go)', storageType: 'Type de stockage',
  gpu: 'Carte graphique', screenSizeInch: 'Écran (pouces)', resolution: 'Résolution', operatingSystem: 'Système',
  isTouchscreen: 'Écran tactile', batteryNote: 'Autonomie', description: 'Description', usageSlugs: 'Usages',
};

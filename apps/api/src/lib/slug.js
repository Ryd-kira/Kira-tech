export function slugify(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 120) || 'produit';
}

// Slug unique : « dell-latitude-5420 », puis « dell-latitude-5420-2 »…
export async function uniqueSlug(client, model, base, excludeId) {
  const root = slugify(base);
  for (let i = 1; i < 500; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const found = await client[model].findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!found || found.id === excludeId) return candidate;
  }
  throw new Error('Impossible de générer un slug unique');
}

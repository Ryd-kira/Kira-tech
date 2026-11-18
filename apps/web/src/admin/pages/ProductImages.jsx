import { useState } from 'react';
import { api } from '../../lib/api.js';
import { ConfirmDialog, Notice } from '../ui.jsx';

const MAX_BYTES = 8 * 1024 * 1024;

// Envoi direct navigateur -> Cloudinary avec une signature fournie par l'API (le secret reste sur le serveur).
async function uploadOne(productId, file) {
  const sig = await api(`/admin/products/${productId}/images/signature`, { method: 'POST', body: {} });
  const form = new FormData();
  Object.entries(sig.params).forEach(([k, v]) => form.append(k, v));
  form.append('file', file);
  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ? `Cloudinary : ${data.error.message}` : "L'envoi de la photo a échoué.");
  return api(`/admin/products/${productId}/images`, {
    method: 'POST',
    body: { publicId: data.public_id, version: data.version, format: data.format, width: data.width, height: data.height },
  });
}

export default function ProductImages({ productId, images, onChange }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function onFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    setError(null);
    for (const [i, file] of files.entries()) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError(new Error(`${file.name} : format accepté JPG, PNG ou WebP.`)); continue; }
      if (file.size > MAX_BYTES) { setError(new Error(`${file.name} : 8 Mo maximum.`)); continue; }
      setBusy(`Envoi de la photo ${i + 1} sur ${files.length}…`);
      try { await uploadOne(productId, file); } catch (err) { setError(err); break; }
    }
    setBusy(null);
    onChange();
  }
  async function move(index, delta) {
    const ids = images.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    setBusy('Enregistrement de l’ordre…');
    try { await api(`/admin/products/${productId}/images/order`, { method: 'PUT', body: { ids } }); } catch (err) { setError(err); }
    setBusy(null);
    onChange();
  }
  async function remove() {
    setBusy('Suppression…');
    try { await api(`/admin/products/${productId}/images/${toDelete.id}`, { method: 'DELETE' }); } catch (err) { setError(err); }
    setToDelete(null);
    setBusy(null);
    onChange();
  }

  return (
    <section className="panel p-5 flex flex-col gap-4" aria-labelledby="photos-title">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <h2 id="photos-title" className="text-lg">Photos</h2>
        <label className="btn btn-ghost cursor-pointer">
          Ajouter des photos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={onFiles} disabled={!!busy} />
        </label>
      </div>
      {busy && <Notice>{busy}</Notice>}
      {error && <Notice kind={error.code === 'CLOUDINARY_NOT_CONFIGURED' ? 'warning' : 'error'}>{error.message}</Notice>}
      {images.length === 0 && <p className="muted m-0 text-sm">Aucune photo. La première photo ajoutée devient la photo principale du produit.</p>}
      <ol className="list-none m-0 p-0 grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
        {images.map((img, i) => (
          <li key={img.id} className="border border-[#DDE3EC] rounded-lg overflow-hidden bg-white flex flex-col">
            <img src={img.url.replace('/upload/', '/upload/f_auto,q_auto,c_fill,w_320,h_240/')} alt={img.alt} className="w-full aspect-[4/3] object-cover" loading="lazy" />
            <div className="p-2 flex flex-col gap-2 text-[13px]">
              <span className="muted">{i === 0 ? 'Photo principale' : `Photo ${i + 1}`}</span>
              <div className="flex gap-1.5">
                <button type="button" className="btn btn-ghost !min-h-9 !px-2.5 !text-[13px]" disabled={i === 0 || !!busy} onClick={() => move(i, -1)} aria-label={`Avancer la photo ${i + 1}`}>Avant</button>
                <button type="button" className="btn btn-ghost !min-h-9 !px-2.5 !text-[13px]" disabled={i === images.length - 1 || !!busy} onClick={() => move(i, 1)} aria-label={`Reculer la photo ${i + 1}`}>Après</button>
                <button type="button" className="btn btn-danger !min-h-9 !px-2.5 !text-[13px] ml-auto" disabled={!!busy} onClick={() => setToDelete({ ...img, n: i + 1 })}>Supprimer</button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <ConfirmDialog open={!!toDelete} title={`Supprimer la photo ${toDelete?.n} ?`} confirmLabel="Supprimer la photo" busy={busy === 'Suppression…'}
        onCancel={() => setToDelete(null)} onConfirm={remove}>
        La photo est retirée du produit et supprimée de Cloudinary.
      </ConfirmDialog>
    </section>
  );
}

import { useEffect, useRef } from 'react';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex justify-between items-end gap-4 flex-wrap mb-5">
      <div>
        <h1 className="text-[28px]">{title}</h1>
        {subtitle && <p className="muted m-0 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Notice({ kind = 'info', children }) {
  const styles = {
    info: 'border-[#C9D1DD] bg-white text-[#090D16]',
    success: 'border-[#9AD9B8] bg-[#ECF9F2] text-[#0B5A35]',
    error: 'border-[#F0B4AE] bg-[#FDF0EE] text-[#8F1D13]',
    warning: 'border-[#F2D28C] bg-[#FFF8E6] text-[#6B4600]',
  };
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`border rounded-md px-4 py-3 text-sm ${styles[kind]}`}>{children}</div>;
}

export function Field({ label, error, hint, children }) {
  return (
    <label className="label">
      {label}
      {children}
      {hint && !error && <span className="font-normal text-[13px] muted">{hint}</span>}
      {error && <span className="font-normal text-[13px] text-[#B42318]">{error}</span>}
    </label>
  );
}

// Confirmation d'une action destructive : le nom de l'élément est répété dans la question.
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, busy }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }} className="admin rounded-[10px] border border-[#DDE3EC] p-0 w-[min(460px,92vw)] min-h-0 backdrop:bg-black/40 m-auto">
      <div className="p-6 flex flex-col gap-4">
        <h2 className="text-xl">{title}</h2>
        <div className="muted text-[15px]">{children}</div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? 'En cours…' : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

export function Pager({ data, page, onPage }) {
  if (!data || data.pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 p-3 text-sm">
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button>
      <span className="num muted">Page {page} sur {data.pages} ({data.total})</span>
      <button type="button" className="btn btn-ghost" disabled={page >= data.pages} onClick={() => onPage(page + 1)}>Suivant</button>
    </div>
  );
}

export const fieldErrors = (err) => Object.fromEntries((err?.details ?? []).map((d) => [d.field, d.message]));

export const STATUS_LABELS = { DRAFT: 'Brouillon', PUBLISHED: 'En ligne', ARCHIVED: 'Archivé' };
export const STOCK_COLORS = { IN_STOCK: '#0B7A47', LOW_STOCK: '#8A5A00', OUT_OF_STOCK: '#B42318' };

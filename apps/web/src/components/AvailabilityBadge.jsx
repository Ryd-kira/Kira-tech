const COLORS = { IN_STOCK: 'var(--color-ok)', LOW_STOCK: 'var(--color-low)', OUT_OF_STOCK: 'var(--color-out)', UNAVAILABLE: 'var(--color-grey)' };

export default function AvailabilityBadge({ availability }) {
  if (!availability) return null;
  const color = COLORS[availability.status] ?? COLORS.UNAVAILABLE;
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color }}>
      <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: color }} />
      {availability.label}
      {availability.quantity != null && <span className="num font-normal">({availability.quantity})</span>}
    </span>
  );
}

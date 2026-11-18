// Une case de la « plaque » : le chiffre d'abord, l'unité ensuite.
export function SpecCell({ value, unit, label, className = '' }) {
  return (
    <div className={`px-3.5 py-3 flex flex-col gap-0.5 min-w-0 ${className}`}>
      <div className="num wide text-[22px] font-bold leading-tight truncate">
        {value ?? '-'}
        {unit && <span className="text-[13px] font-semibold text-grey ml-1">{unit}</span>}
      </div>
      <div className="text-[13px] text-grey">{label}</div>
    </div>
  );
}

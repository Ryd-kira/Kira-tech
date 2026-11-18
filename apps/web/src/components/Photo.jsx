export default function Photo({ image, alt, className = '', sizes, eager = false, label = 'Photo à venir' }) {
  if (!image) {
    return (
      <div className={`bg-ink-2 flex items-center justify-center text-grey text-[13px] ${className}`} role="img" aria-label={alt ?? label}>
        {label}
      </div>
    );
  }
  return (
    <img src={image.url} alt={image.alt || alt || ''} width={image.width} height={image.height} sizes={sizes}
      loading={eager ? 'eager' : 'lazy'} decoding="async" className={`object-cover bg-ink-2 ${className}`} />
  );
}

import { formatAmount } from '../lib/format.js';

export default function Price({ product, size = 'md' }) {
  if (product.priceOnRequest || product.price == null) {
    return <div className={size === 'lg' ? 'text-2xl font-semibold' : size === 'sm' ? 'text-[15px] font-semibold' : 'text-[17px] font-semibold'}>Prix sur demande</div>;
  }
  const big = { lg: 'text-[39px]', md: 'text-[22px]', sm: 'text-lg' }[size];
  const small = size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-xs' : 'text-sm';
  return (
    <div className={`num wide font-bold leading-none ${big}`}>
      {formatAmount(product.price)} <span className={`${small} text-grey`}>FCFA</span>
    </div>
  );
}

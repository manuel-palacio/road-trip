import { Link } from 'react-router-dom';

type Props = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Render the brand as a Link to this path. Omit to render a plain
   * <span> (used on screens like Login + the test where there's no
   * Router context, or where clicking the logo would be a no-op). */
  to?: string;
};

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-[20px]',
  md: 'text-[28px]',
  lg: 'text-[44px]',
  xl: 'text-[clamp(54px,9vw,92px)]',
};

export function Brand({ size = 'md', to }: Props) {
  const inner = (
    <>
      Road <span className="text-accent">Trip</span>
    </>
  );
  const className = `font-serif italic font-normal tracking-tight leading-none ${sizeClass[size]}`;
  if (to) {
    return (
      <Link to={to} className={`${className} hover:opacity-80 transition-opacity`} aria-label="Go to home">
        {inner}
      </Link>
    );
  }
  return <span className={className}>{inner}</span>;
}

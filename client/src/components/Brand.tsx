type Props = { size?: 'sm' | 'md' | 'lg' | 'xl' };

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-[20px]',
  md: 'text-[28px]',
  lg: 'text-[44px]',
  xl: 'text-[clamp(54px,9vw,92px)]',
};

export function Brand({ size = 'md' }: Props) {
  return (
    <span className={`font-serif italic font-normal tracking-tight leading-none ${sizeClass[size]}`}>
      Road <span className="text-accent">Trip</span>
    </span>
  );
}

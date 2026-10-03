type DiamondLogoProps = {
  className?: string;
  size?: number;
};

// The accepted Diamond Animator mark used in the Home header.
export function DiamondLogo({ className, size }: DiamondLogoProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9 7 4h10l4 5-9 11L3 9Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
      <path d="M3 9h18M7 4l5 16L17 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

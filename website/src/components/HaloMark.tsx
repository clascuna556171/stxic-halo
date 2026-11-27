import { useId, type SVGProps } from 'react';

/**
 * STXIC Halo brand mark:
 * Bold "H" monogram with a -24 deg tilted orbital ring and #FF6A1A sentinel dot.
 */
export default function HaloMark({
  size = 28,
  cutoutColor = '#F4F1EC',
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; cutoutColor?: string }) {
  const clipId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true" {...props}>
      <g transform="translate(20.36 73.25)">
        <g transform="rotate(-24 29.64 -23.25)">
          <ellipse cx="29.64" cy="-23.25" rx="46" ry="17" fill="none" stroke="currentColor" strokeWidth="6" />
        </g>
        <path
          fill="currentColor"
          d="M3.72 0L3.72-46.50L19.72-46.50L19.72-30.81L39.56-30.81L39.56-46.50L55.55-46.50L55.55 0L39.56 0L39.56-16.68L19.72-16.68L19.72 0L3.72 0Z"
        />
        <g transform="rotate(-24 29.64 -23.25)">
          <clipPath id={clipId}>
            <rect x="-30.36" y="-23.25" width="120" height="40" />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            <ellipse
              cx="29.64"
              cy="-23.25"
              rx="46"
              ry="17"
              fill="none"
              stroke={cutoutColor}
              strokeWidth="16"
            />
            <ellipse cx="29.64" cy="-23.25" rx="46" ry="17" fill="none" stroke="currentColor" strokeWidth="6" />
          </g>
          <circle cx="54.49" cy="-8.94" r="5.5" fill="#FF6A1A" stroke={cutoutColor} strokeWidth="3" />
        </g>
      </g>
    </svg>
  );
}

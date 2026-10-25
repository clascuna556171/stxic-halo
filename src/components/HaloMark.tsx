import type { SVGProps } from 'react';

/**
 * STXIC Halo orbital reticle mark.
 * Concentric 96x96 geometry around (48, 48):
 * - Outer orbital arc: R=32, 312° span with 48° aperture centered at -30°
 * - Inner datum arc: R=19, 60° span across upper-left quadrant (195° to 255°)
 * - Sentinel node: R=5.25 seated at (75.71, 32.00) on the R=32 orbit
 * - Workspace core: R=8.5 centered at (48, 48)
 */
export default function HaloMark({ size = 28, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true" {...props}>
      <path
        d="M 79.82 44.66 A 32 32 0 1 1 66.81 22.11"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path
        d="M 29.65 43.08 A 19 19 0 0 1 43.08 29.65"
        stroke="#B5F5CD"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="75.71" cy="32" r="5.25" fill="#B5F5CD" />
      <circle cx="48" cy="48" r="8.5" fill="currentColor" />
    </svg>
  );
}

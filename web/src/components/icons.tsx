// Small inline icons (stroke-based, 16px grid) so nothing is fetched at runtime.
import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...p,
});

export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" />
  </svg>
);

export const IconGitHub = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
    <path d="M8 .3a7.8 7.8 0 0 0-2.5 15.2c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.6-1-2.6-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.7-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.1.8a7.3 7.3 0 0 1 3.9 0c1.5-1 2.1-.8 2.1-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3-1.8 3.7-3.6 3.9.3.3.6.8.6 1.5v2.2c0 .2.1.5.6.4A7.8 7.8 0 0 0 8 .3Z" />
  </svg>
);

export const IconCpu = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    <path d="M6 1.5v2M10 1.5v2M6 12.5v2M10 12.5v2M1.5 6h2M1.5 10h2M12.5 6h2M12.5 10h2" />
  </svg>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ ...p, strokeWidth: 2.2 })}>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ ...p, strokeWidth: 2.2 })}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const IconDot = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
    <circle cx="8" cy="8" r="3.5" />
  </svg>
);

export const IconDash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 8h6" />
  </svg>
);

export const IconMerge = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="4" cy="3.5" r="1.8" />
    <circle cx="4" cy="12.5" r="1.8" />
    <circle cx="12" cy="9" r="1.8" />
    <path d="M4 5.3v5.4M4 5.5c0 2.5 2 3.5 6.2 3.5" />
  </svg>
);

export const IconEye = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

export const IconPr = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="4" cy="3.5" r="1.8" />
    <circle cx="4" cy="12.5" r="1.8" />
    <circle cx="12" cy="12.5" r="1.8" />
    <path d="M4 5.3v5.4M12 10.7V6.5c0-1.2-.8-2-2-2H7.5M9 3l-1.5 1.5L9 6" />
  </svg>
);

export const IconBell = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8L4 11ZM6.5 14h3" />
  </svg>
);

export const IconFlame = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 14.5c2.8 0 4.5-1.9 4.5-4.4 0-3.1-2.6-4.3-3.3-8.1-1.9 1.3-2.4 3.4-2.2 5-1-.4-1.6-1.4-1.7-2.4-1.2 1.2-1.8 3-1.8 4.9 0 2.6 1.7 5 4.5 5Z" />
  </svg>
);

export const IconBattery = ({ level, charging, ...p }: SVGProps<SVGSVGElement> & { level: number; charging?: boolean }) => (
  <svg {...base({ ...p, width: 22, viewBox: '0 0 22 16' })}>
    <rect x="1" y="4" width="17" height="9" rx="2" />
    <path d="M20 7v3" />
    <rect x="3" y="6" width={Math.max(0.5, (13 * level) / 100)} height="5" rx="0.8" fill="currentColor" stroke="none" />
    {charging && <path d="M10.5 5 8 9h3l-2.5 4" stroke="var(--surface-1)" strokeWidth="2.6" />}
    {charging && <path d="M10.5 5 8 9h3l-2.5 4" />}
  </svg>
);

export const IconUsb = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 1.5v11M8 1.5 6.5 3.5h3L8 1.5ZM8 10l-3.5-2V6M8 8.5l3.5-2V5" />
    <circle cx="8" cy="13" r="1.5" />
    <rect x="3.5" y="4.5" width="2" height="1.6" />
    <circle cx="11.5" cy="4.3" r="0.9" />
  </svg>
);

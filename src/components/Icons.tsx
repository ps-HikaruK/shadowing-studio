import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconPlay = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none">
    <path d="M7 4.5v15l12-7.5z" />
  </svg>
);
export const IconPause = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);
export const IconPrev = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none">
    <path d="M6 5h2v14H6zM19 5v14L9 12z" />
  </svg>
);
export const IconNext = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none">
    <path d="M16 5h2v14h-2zM5 5v14l10-7z" />
  </svg>
);
export const IconRewind = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <text x="8.5" y="15.5" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">
      3
    </text>
  </svg>
);
export const IconLoop = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);
export const IconMic = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);
export const IconStop = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
export const IconCompare = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7h11" />
    <path d="M12 4l3 3-3 3" />
    <path d="M20 17H9" />
    <path d="M12 14l-3 3 3 3" />
  </svg>
);
export const IconEye = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconEyeOff = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
    <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.5" />
    <path d="M6.6 6.6C3.7 8.6 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.7" />
  </svg>
);
export const IconFlag = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h11l-1.5 4L16 12H5" />
  </svg>
);
export const IconBack = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const IconPlus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconSettings = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconDatabase = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </svg>
);
export const IconEdit = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
export const IconTrash = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </svg>
);
export const IconUp = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);
export const IconDown = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const IconMerge = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M7 4v6a4 4 0 0 0 4 4h6" />
    <path d="M14 11l3 3-3 3" />
    <path d="M7 20v-4" />
  </svg>
);
export const IconSplit = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3v18" />
    <path d="M5 8l-3 4 3 4" />
    <path d="M19 8l3 4-3 4" />
  </svg>
);
export const IconSpinner = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} className={`animate-spin ${p.className ?? ""}`}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </svg>
);
export const IconCheck = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 12l5 5L20 7" />
  </svg>
);
export const IconAlert = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v4M12 18h.01" />
  </svg>
);
export const IconVolume = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 10v4h3l5 4V6L7 10z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
    <path d="M18.5 6.5a8 8 0 0 1 0 11" />
  </svg>
);

import React from 'react';

const svgProps = (size = 15) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.65',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
});

export const SearchIcon = ({ size = 15 }) => (
  <svg {...svgProps(size)}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const ExternalArrowIcon = ({ size = 13 }) => (
  <svg {...svgProps(size)}>
    <path d="M7 17L17 7M17 7H8M17 7V16" />
  </svg>
);

export const CompassIcon = ({ size = 14 }) => (
  <svg {...svgProps(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
  </svg>
);

export const SunIcon = ({ size = 15 }) => (
  <svg {...svgProps(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
  </svg>
);

export const MoonIcon = ({ size = 15 }) => (
  <svg {...svgProps(size)}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export const CloseIcon = ({ size = 16 }) => (
  <svg {...svgProps(size)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const CheckIcon = ({ size = 14 }) => (
  <svg {...svgProps(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const CopyIcon = ({ size = 14 }) => (
  <svg {...svgProps(size)}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const TerminalIcon = ({ size = 15 }) => (
  <svg {...svgProps(size)}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

export const ArrowUpIcon = ({ size = 15 }) => (
  <svg {...svgProps(size)}>
    <path d="m18 15-6-6-6 6" />
  </svg>
);

export const GridIcon = ({ size = 14 }) => (
  <svg {...svgProps(size)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const TableListIcon = ({ size = 14 }) => (
  <svg {...svgProps(size)}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

export const BookmarkIcon = ({ size = 14, filled = false }) => (
  <svg {...svgProps(size)} fill={filled ? 'currentColor' : 'none'}>
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
);

export const CalendarIcon = ({ size = 14 }) => (
  <svg {...svgProps(size)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export const CommandIcon = ({ size = 14 }) => (
  <svg {...svgProps(size)}>
    <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
  </svg>
);

export default {
  SearchIcon,
  ExternalArrowIcon,
  CompassIcon,
  SunIcon,
  MoonIcon,
  CloseIcon,
  CheckIcon,
  CopyIcon,
  TerminalIcon,
  ArrowUpIcon,
  GridIcon,
  TableListIcon,
  BookmarkIcon,
  CalendarIcon,
  CommandIcon,
};

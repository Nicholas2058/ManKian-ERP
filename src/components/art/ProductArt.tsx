import type { ArtKey } from '@/domain/types';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { photoFor } from '@/data/productPhotos';

/**
 * Product imagery: a product photo from the client's own website when one is mapped to the SKU
 * (see src/data/productPhotos.ts), otherwise an original lightweight product-type illustration.
 */
const S = { stroke: 'var(--art-ink)', strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const F = 'var(--art-fill)';
const A = 'var(--art-accent)';
const O = 'var(--art-warm)';

function Shape({ k }: { k: ArtKey }) {
  switch (k) {
    case 'pipe':
      return (
        <g {...S}>
          <rect x="14" y="36" width="88" height="20" rx="4" fill={F} />
          <ellipse cx="102" cy="46" rx="6" ry="10" fill={A} />
          <path d="M22 41h60" opacity=".4" />
        </g>
      );
    case 'elbow':
      return (
        <g {...S}>
          <path d="M30 72V48a18 18 0 0 1 18-18h30" fill="none" strokeWidth="18" stroke="var(--art-ink)" />
          <path d="M30 72V48a18 18 0 0 1 18-18h30" fill="none" strokeWidth="12" stroke={F} />
          <rect x="78" y="20" width="12" height="20" rx="3" fill={A} />
          <rect x="20" y="70" width="20" height="10" rx="3" fill={A} />
        </g>
      );
    case 'tee':
      return (
        <g {...S}>
          <rect x="18" y="34" width="84" height="20" rx="4" fill={F} />
          <rect x="50" y="52" width="20" height="26" rx="3" fill={F} />
          <rect x="12" y="31" width="10" height="26" rx="3" fill={A} />
          <rect x="98" y="31" width="10" height="26" rx="3" fill={A} />
        </g>
      );
    case 'valve':
      return (
        <g {...S}>
          <rect x="16" y="46" width="88" height="16" rx="4" fill={F} />
          <circle cx="60" cy="54" r="14" fill={A} />
          <path d="M60 40V24M44 22h34" strokeWidth="6" stroke={O} />
        </g>
      );
    case 'tank':
      return (
        <g {...S}>
          <rect x="34" y="20" width="52" height="58" rx="10" fill={F} />
          <path d="M34 36h52M34 52h52M34 68h52" opacity=".35" />
          <rect x="50" y="12" width="20" height="10" rx="3" fill={A} />
        </g>
      );
    case 'anchor':
    case 'sealant':
      return (
        <g {...S}>
          <rect x="22" y="36" width="64" height="20" rx="5" fill={F} />
          <path d="M86 40l18 6-18 6z" fill={A} />
          <rect x="14" y="38" width="10" height="16" rx="2" fill={O} />
          <path d="M34 42h40" opacity=".35" />
        </g>
      );
    case 'bolt':
      return (
        <g {...S}>
          <path d="M22 34l10-8h16l10 8v18l-10 8H32l-10-8z" fill={A} />
          <rect x="56" y="38" width="46" height="12" rx="3" fill={F} />
          <path d="M64 38v12M72 38v12M80 38v12M88 38v12M96 38v12" opacity=".5" />
        </g>
      );
    case 'ubolt':
      return (
        <g {...S}>
          <path d="M38 18v34a22 22 0 0 0 44 0V18" fill="none" strokeWidth="9" stroke="var(--art-ink)" />
          <path d="M38 18v34a22 22 0 0 0 44 0V18" fill="none" strokeWidth="4" stroke={F} />
          <rect x="24" y="24" width="72" height="10" rx="3" fill={A} />
        </g>
      );
    case 'angle':
      return (
        <g {...S}>
          <path d="M20 66l64-36h14L34 66z" fill={F} />
          <path d="M20 66v-12l64-36v12" fill={A} />
        </g>
      );
    case 'beam':
      return (
        <g {...S}>
          <path d="M30 20h60v10H66v30h24v10H30V60h24V30H30z" fill={F} />
          <path d="M90 20l10-6v10l-10 6M90 60l10-6v10l-10 6" fill={A} />
        </g>
      );
    case 'channel':
      return (
        <g {...S}>
          <path d="M34 18h48v12H48v30h34v12H34z" fill={F} />
          <path d="M82 18l12-6v12l-12 6M82 60l12-6v12l-12 6" fill={A} />
        </g>
      );
    case 'paver':
    case 'block':
      return (
        <g {...S}>
          <path d="M18 54l22-12 22 12-22 12z" fill={F} />
          <path d="M58 54l22-12 22 12-22 12z" fill={A} />
          <path d="M38 36l22-12 22 12-22 12z" fill={F} />
          {k === 'block' && <path d="M60 28l6 6-6 6-6-6z" fill={O} />}
        </g>
      );
    case 'pad':
    case 'board':
      return (
        <g {...S}>
          <path d="M18 50l42-20 42 20-42 20z" fill={F} />
          <path d="M18 50v8l42 20 42-20v-8" fill={A} />
        </g>
      );
    case 'geotextile':
    case 'netting':
      return (
        <g {...S}>
          <ellipse cx="34" cy="46" rx="14" ry="24" fill={A} />
          <path d="M34 22h56v48H34" fill={F} />
          {k === 'netting' ? <path d="M44 22l20 48M64 22l20 48M84 22L64 70M64 22L44 70" opacity=".5" /> : <path d="M48 34h36M48 46h36M48 58h36" opacity=".35" />}
        </g>
      );
    case 'mesh':
      return (
        <g {...S}>
          <rect x="22" y="18" width="76" height="56" rx="3" fill="none" />
          <path d="M22 32h76M22 46h76M22 60h76M41 18v56M60 18v56M79 18v56" stroke={A} />
        </g>
      );
    case 'roof':
      return (
        <g {...S}>
          <path d="M14 60q8-14 16 0t16 0 16 0 16 0 16 0 16 0V70H14z" fill={F} />
          <path d="M14 46q8-14 16 0t16 0 16 0 16 0 16 0 16 0" fill="none" stroke={A} />
        </g>
      );
    case 'bag':
      return (
        <g {...S}>
          <path d="M30 22h60l6 52H24z" fill={F} />
          <rect x="40" y="40" width="40" height="18" rx="3" fill={A} />
          <path d="M30 22l6-6h48l6 6" fill="none" />
        </g>
      );
    case 'barrier':
    case 'cone':
      return k === 'cone' ? (
        <g {...S}>
          <path d="M60 14l20 58H40z" fill={O} />
          <path d="M48 46h24M44 58h32" stroke="#fff" strokeWidth="5" />
          <rect x="30" y="70" width="60" height="8" rx="2" fill={F} />
        </g>
      ) : (
        <g {...S}>
          <path d="M16 70l10-40h68l10 40z" fill={F} />
          <path d="M30 36l-6 30M50 36l-6 30M70 36l-6 30M90 36l-6 30" stroke={O} strokeWidth="6" />
        </g>
      );
    case 'helmet':
      return (
        <g {...S}>
          <path d="M28 58a32 30 0 0 1 64 0z" fill={O} />
          <path d="M18 58h84v8H18z" fill={F} />
          <path d="M60 28v30" opacity=".4" />
        </g>
      );
    case 'gloves':
      return (
        <g {...S}>
          <path d="M40 76V40l4-18 6 16 4-20 6 20 4-18 4 20 6-12-2 30-6 18z" fill={F} />
          <rect x="38" y="70" width="42" height="10" rx="3" fill={A} />
        </g>
      );
    case 'vest':
      return (
        <g {...S}>
          <path d="M38 16l10 10h24l10-10 12 16-6 46H32l-6-46z" fill={A} />
          <path d="M32 50h56M32 62h56" stroke="#fff" strokeWidth="5" />
        </g>
      );
    case 'harness':
      return (
        <g {...S}>
          <path d="M44 16l16 30 16-30M44 76l16-30 16 30" fill="none" stroke={O} strokeWidth="6" />
          <circle cx="60" cy="46" r="7" fill={F} />
        </g>
      );
    case 'mask':
      return (
        <g {...S}>
          <path d="M22 40q38-18 76 0v10q-6 18-38 18T22 50z" fill={F} />
          <circle cx="44" cy="46" r="8" fill={A} />
          <circle cx="76" cy="46" r="8" fill={A} />
        </g>
      );
    case 'drill':
      return (
        <g {...S}>
          <path d="M26 30h50a8 8 0 0 1 8 8v4a8 8 0 0 1-8 8H50l-6 26H32l4-26h-10z" fill={A} />
          <path d="M84 40h22" strokeWidth="4" />
          <rect x="30" y="64" width="18" height="14" rx="2" fill={O} />
        </g>
      );
    case 'grinder':
      return (
        <g {...S}>
          <rect x="18" y="36" width="64" height="18" rx="9" fill={A} />
          <circle cx="92" cy="45" r="16" fill={F} />
          <circle cx="92" cy="45" r="4" fill={O} />
        </g>
      );
    case 'saw':
    case 'disc':
      return (
        <g {...S}>
          <circle cx="60" cy="46" r="28" fill={F} />
          <circle cx="60" cy="46" r="8" fill={A} />
          <path d="M60 18v6M60 68v6M32 46h6M82 46h6M40 26l4 4M76 62l4 4M40 66l4-4M76 30l4-4" />
        </g>
      );
    case 'hammer':
      return (
        <g {...S}>
          <rect x="54" y="34" width="10" height="44" rx="3" fill={O} />
          <path d="M30 20h56l8 8v8H30z" fill={A} />
        </g>
      );
    case 'spanner':
      return (
        <g {...S}>
          <path d="M30 70l40-40" strokeWidth="12" stroke="var(--art-ink)" />
          <path d="M30 70l40-40" strokeWidth="6" stroke={F} />
          <path d="M66 22a14 14 0 1 0 14 14l-8 0-6-6z" fill={A} />
        </g>
      );
    case 'tape':
      return (
        <g {...S}>
          <rect x="28" y="22" width="48" height="48" rx="12" fill={A} />
          <circle cx="52" cy="46" r="10" fill={F} />
          <path d="M76 58h26v8H76" fill={O} />
        </g>
      );
    case 'level':
      return (
        <g {...S}>
          <rect x="14" y="38" width="92" height="18" rx="3" fill={A} />
          <rect x="52" y="41" width="16" height="12" rx="6" fill={F} />
        </g>
      );
    case 'screwdriver':
    case 'pliers':
      return (
        <g {...S}>
          <path d="M34 70l22-22" strokeWidth="10" stroke={O} />
          <path d="M56 48l26-26" strokeWidth="4" />
          <path d="M56 70l-22-22" strokeWidth="10" stroke={A} opacity={k === 'pliers' ? 1 : 0} />
        </g>
      );
    case 'pail':
      return (
        <g {...S}>
          <path d="M34 30h52l-6 46H40z" fill={F} />
          <path d="M34 30q26-26 52 0" fill="none" />
          <rect x="42" y="44" width="36" height="14" rx="2" fill={A} />
        </g>
      );
    case 'drum':
      return (
        <g {...S}>
          <rect x="38" y="16" width="44" height="62" rx="6" fill={A} />
          <path d="M38 36h44M38 58h44" stroke={F} />
        </g>
      );
    case 'spray':
      return (
        <g {...S}>
          <rect x="44" y="30" width="30" height="48" rx="6" fill={A} />
          <rect x="52" y="20" width="14" height="10" rx="2" fill={F} />
          <path d="M78 22h10M80 16l6-4M80 28l6 4" />
        </g>
      );
    case 'cable':
    case 'hose':
      return (
        <g {...S}>
          <circle cx="56" cy="46" r="26" fill="none" strokeWidth="8" stroke={k === 'hose' ? A : O} />
          <circle cx="56" cy="46" r="16" fill="none" strokeWidth="6" stroke={F} />
          <path d="M82 46h22" strokeWidth="5" />
        </g>
      );
    case 'lamp':
      return (
        <g {...S}>
          <rect x="30" y="22" width="60" height="38" rx="6" fill={F} />
          <rect x="38" y="30" width="44" height="22" rx="3" fill={A} />
          <path d="M60 60v14M44 76h32" />
        </g>
      );
    case 'fan':
      return (
        <g {...S}>
          <circle cx="60" cy="44" r="28" fill={F} />
          <path d="M60 44c0-14 10-18 14-14s-4 14-14 14zm0 0c-14 0-18 10-14 14s14-4 14-14zm0 0c0 14-10 18-14 14" fill={A} />
          <path d="M60 72v8" />
        </g>
      );
    case 'socket':
      return (
        <g {...S}>
          <rect x="22" y="30" width="76" height="30" rx="6" fill={F} />
          <circle cx="42" cy="45" r="6" fill={A} />
          <circle cx="60" cy="45" r="6" fill={A} />
          <circle cx="78" cy="45" r="6" fill={A} />
        </g>
      );
    case 'box':
    case 'lock':
      return k === 'lock' ? (
        <g {...S}>
          <path d="M44 40V30a16 16 0 0 1 32 0v10" fill="none" strokeWidth="6" />
          <rect x="36" y="40" width="48" height="36" rx="6" fill={O} />
        </g>
      ) : (
        <g {...S}>
          <path d="M22 34l38-14 38 14-38 14z" fill={A} />
          <path d="M22 34v30l38 14 38-14V34" fill={F} />
          <path d="M60 48v30" />
        </g>
      );
    case 'shelf':
      return (
        <g {...S}>
          <path d="M30 14v64M90 14v64" />
          <path d="M30 26h60M30 46h60M30 66h60" strokeWidth="5" stroke={A} />
          <rect x="38" y="32" width="18" height="12" fill={F} />
          <rect x="62" y="52" width="20" height="12" fill={F} />
        </g>
      );
    case 'ladder':
    case 'platform':
      return (
        <g {...S}>
          <path d="M40 78l14-62M80 78l-14-62" strokeWidth="5" />
          <path d="M46 62h28M49 48h22M52 34h16" stroke={A} strokeWidth="5" />
          {k === 'platform' && <rect x="44" y="12" width="32" height="8" rx="2" fill={O} />}
        </g>
      );
    case 'bits':
      return (
        <g {...S}>
          <path d="M30 70l36-48M46 74l36-48M62 78l36-48" strokeWidth="5" stroke={A} />
        </g>
      );
    case 'wheelbarrow':
      return (
        <g {...S}>
          <path d="M22 34h66l-12 22H34z" fill={A} />
          <circle cx="52" cy="68" r="10" fill={F} />
          <path d="M88 34l14-8M34 56l-8 18" />
        </g>
      );
    default:
      return (
        <g {...S}>
          <rect x="34" y="24" width="52" height="44" rx="8" fill={F} />
        </g>
      );
  }
}

export function ProductArt({ art, sku, className, label }: { art: ArtKey; sku?: string; className?: string; label?: string }) {
  const photo = sku ? photoFor(sku) : undefined;
  const [failed, setFailed] = React.useState(false);
  if (photo && !failed) {
    return (
      <span className={cn('block h-full w-full bg-white', className)}>
        <img src={photo} alt={label ?? ''} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className="block h-full w-full object-contain p-[6%]" />
      </span>
    );
  }
  return (
    <svg viewBox="0 0 120 90" className={cn('block h-full w-full', className)} role="img" aria-label={label ?? `${art} illustration`}>
      <defs>
        <linearGradient id="pa-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-soft)" />
          <stop offset="1" stopColor="var(--surface-3)" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill="url(#pa-bg)" />
      <g style={{ ['--art-ink' as string]: 'var(--brand-strong)', ['--art-fill' as string]: 'var(--surface)', ['--art-accent' as string]: 'var(--accent)', ['--art-warm' as string]: 'var(--orange)' }}>
        <Shape k={art} />
      </g>
    </svg>
  );
}

import { useId } from 'react';
import { COLLAPSE_SYMBOL_SIZE } from './solve';

// Match the hub's luminance-mask symbols; the canvas shows through the glyph.
export default function CollapseSymbol({ collapsed }: { collapsed: boolean }) {
  const id = useId();
  return <span className="topology-collapse-symbol" style={{ width: COLLAPSE_SYMBOL_SIZE, height: COLLAPSE_SYMBOL_SIZE }}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="20" height="20" style={{ maskType: 'luminance' }}>
          <rect width="20" height="20" fill="white" />
          <path d={collapsed ? 'M5 10H15 M10 5V15' : 'M5 10H15'} fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" />
        </mask>
      </defs>
      <circle cx="10" cy="10" r="10" fill="var(--account-color)" mask={`url(#${id})`} />
    </svg>
  </span>;
}

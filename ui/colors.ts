// Quota colors are owned by tokens.css; changing the decorative accent only
// changes the good-reading color. All warning levels keep their fixed palette.
export const usageColors = {
  unknown: 'var(--quota-unknown)', good: 'var(--quota-good)',
  caution: 'var(--quota-caution)', warning: 'var(--quota-warning)',
  exhausted: 'var(--quota-exhausted)',
} as const;

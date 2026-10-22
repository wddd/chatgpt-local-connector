import { deg, type Point, type Side } from "./solve.ts";

function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number) {
  const v = 1 - t;
  return { x: v ** 3 * a.x + 3 * v * v * t * b.x + 3 * v * t * t * c.x + t ** 3 * d.x, y: v ** 3 * a.y + 3 * v * v * t * b.y + 3 * v * t * t * c.y + t ** 3 * d.y };
}
// Tapered tentacle: body width grows toward the root (end point d), with a flare that
// reaches a fixed physical length from the root (after ARC's grownWire).
export function grownWire(a: Point, b: Point, c: Point, d: Point, scale: number, flare: number, thin = false, connecting = false) {
  const N = 48, pts: (Point & { l: number })[] = [];
  let len = 0, prev: Point | null = null;
  for (let i = 0; i <= N; i++) { const p = { ...cubicPoint(a, b, c, d, i / N), l: 0 }; if (prev) len += Math.hypot(p.x - prev.x, p.y - prev.y); p.l = len; pts.push(p); prev = p; }
  const L = len || 1, left: string[] = [], right: string[] = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(N, i + 1)], o = pts[Math.max(0, i - 1)];
    const dx = q.x - o.x, dy = q.y - o.y, m = Math.hypot(dx, dy) || 1;
    const u = p.l / L, s = L - p.l;
    const body = connecting ? 0 : (thin ? 1.2 + 1.6 * u ** 1.6 : 3 + 3 * u ** 1.6);
    const half = scale * (body + (thin ? 7 : 12) * flare * Math.max(0, 1 - s / ((thin ? 16 : 26) * scale)) ** 2) / 2;
    left.push((p.x - dy / m * half).toFixed(1) + ' ' + (p.y + dx / m * half).toFixed(1));
    right.push((p.x + dy / m * half).toFixed(1) + ' ' + (p.y - dx / m * half).toFixed(1));
  });
  const gap = pts.filter(p => Math.abs(p.l - L * 0.45) <= 7 * scale);
  return {
    outline: 'M ' + left.join(' L ') + ' L ' + right.reverse().join(' L ') + ' Z',
    centerline: `M ${a.x} ${a.y} C ${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`,
    gap: gap.length ? `M ${gap.map(p => `${p.x} ${p.y}`).join(' L ')}` : '',
  };
}
export function arcPath(cx: number, cy: number, R: number, lo: number, hi: number, side: Side) {
  const p = (a: number) => ({ x: cx + side * R * Math.cos(deg(a)), y: cy + R * Math.sin(deg(a)) });
  const s = p(lo), e = p(hi);
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${R} ${R} 0 0 ${side > 0 ? 1 : 0} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}


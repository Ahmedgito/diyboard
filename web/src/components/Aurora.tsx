/**
 * Slowly drifting colour blobs.
 *
 * Positions are a pure function of time and only change on the dashboard's existing 1 Hz render,
 * with no CSS transition. The blobs are soft radial gradients moving ~2-4 px/s, so a 1 fps update
 * reads as continuous drift. A 60 fps CSS animation of the same layers cost ~115% CPU on the
 * Tab A (Snapdragon 425); this costs one compositor frame per second, shared with the clock.
 */
const BLOBS = [
  { cls: 'blob-a', ax: 120, ay: 90, px: 97, py: 131, s: 0.08, ps: 71 },
  { cls: 'blob-b', ax: 130, ay: 110, px: 113, py: 89, s: 0.06, ps: 83 },
  { cls: 'blob-c', ax: 140, ay: 80, px: 127, py: 103, s: 0.1, ps: 61 },
];

export function Aurora({ now }: { now: number }) {
  const t = now / 1000;
  return (
    <div className="aurora" aria-hidden>
      {BLOBS.map((b) => {
        const x = b.ax * Math.sin((2 * Math.PI * t) / b.px);
        const y = b.ay * Math.cos((2 * Math.PI * t) / b.py);
        const s = 1 + b.s * Math.sin((2 * Math.PI * t) / b.ps);
        return <div key={b.cls} className={`blob ${b.cls}`} style={{ transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})` }} />;
      })}
    </div>
  );
}

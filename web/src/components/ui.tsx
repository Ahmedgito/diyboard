import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Counts up from 0 on mount, then tweens briefly to each new value.
 * Live updates use a short tween: each frame re-renders text, which is not free on the tablet.
 */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useRef(0);
  const mounted = useRef(false);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const from = shown.current;
    if (from === value) return;
    const duration = mounted.current ? 450 : 1100;
    mounted.current = true;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      shown.current = from + (value - from) * eased;
      setDisplay(shown.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="tnum">{format(display)}</span>;
}

export function Card({ className = '', style, children, delay = 0 }: { className?: string; style?: CSSProperties; children: ReactNode; delay?: number }) {
  return (
    <section className={`card ${className}`} style={{ ...style, animationDelay: `${delay}ms` }}>
      {children}
    </section>
  );
}

export function CardHeader({ icon, title, right }: { icon: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="card-header">
      <span className="card-icon">{icon}</span>
      <span className="card-title">{title}</span>
      <span className="card-header-right">{right}</span>
    </header>
  );
}

/**
 * Vertical bars anchored to a baseline. Single series, so no legend; the caption names it.
 * `highlight` marks one bar (current hour / today) at full strength.
 */
export function Bars({
  values,
  highlight,
  height,
  color = 'var(--series-1)',
  gap = 2,
}: {
  values: number[];
  highlight?: number;
  height: number;
  color?: string;
  gap?: number;
}) {
  const max = Math.max(...values, 0);
  return (
    <div className="bars" style={{ height, gap }}>
      {values.map((v, i) => {
        const h = max > 0 ? Math.max(v > 0 ? 3 : 0, (v / max) * height) : 0;
        const isHi = i === highlight;
        return (
          <div key={i} className="bar-slot">
            <div
              className={`bar ${isHi ? 'bar-hi' : ''}`}
              style={{ height: h, background: color, opacity: highlight === undefined || isHi ? 1 : 0.55, animationDelay: `${300 + i * 25}ms` }}
            />
            {v === 0 && <div className="bar-zero" />}
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({ values, width, height, max = 100, color = 'var(--series-1)' }: { values: number[]; width: number; height: number; max?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 2 - (Math.min(v, max) / max) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} stroke="var(--surface-1)" strokeWidth="2" />
    </svg>
  );
}

export function Meter({ value, color = 'var(--series-1)', height = 6 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="meter" style={{ height }}>
      <div className="meter-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})`, background: color }} />
    </div>
  );
}

/** A digit that rolls vertically to its new value. */
export function RollingDigit({ digit }: { digit: number }) {
  return (
    <span className="roll">
      <span className="roll-strip" style={{ transform: `translateY(${-digit * 10}%)` }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  );
}

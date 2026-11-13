import { useState } from 'react';
import { Card, RollingDigit } from './ui.tsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function load24h(): boolean {
  try {
    return localStorage.getItem('clock24') !== '0';
  } catch {
    return true;
  }
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function greeting(h: number) {
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night shipping';
}

export function Clock({ now, name }: { now: number; name: string | null }) {
  const [h24, setH24] = useState(load24h);
  const d = new Date(now);
  const hours = d.getHours();
  const shownH = h24 ? hours : hours % 12 || 12;
  const hh = String(shownH).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sec = d.getSeconds();
  const dayStart = new Date(d).setHours(0, 0, 0, 0);
  const dayPct = (now - dayStart) / 86_400_000;

  const toggle = () => {
    setH24((v) => {
      try {
        localStorage.setItem('clock24', v ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !v;
    });
  };

  return (
    <Card className="clock-card" delay={0}>
      <div className="clock-greeting">
        {greeting(hours)}
        {name ? <span className="clock-name">, {name}</span> : null}
      </div>
      <button className="clock-time" onClick={toggle} aria-label="Toggle 12/24 hour clock">
        <RollingDigit digit={Number(hh[0])} />
        <RollingDigit digit={Number(hh[1])} />
        <span className={`clock-colon ${sec % 2 ? 'dim' : ''}`}>:</span>
        <RollingDigit digit={Number(mm[0])} />
        <RollingDigit digit={Number(mm[1])} />
        {!h24 && <span className="clock-ampm">{hours < 12 ? 'AM' : 'PM'}</span>}
      </button>
      <div className="ticks" aria-label={`${sec} seconds`}>
        {Array.from({ length: 60 }, (_, i) => (
          <span key={i} className={`tick ${i <= sec ? 'on' : ''} ${i === sec ? 'now' : ''} ${i % 5 === 0 ? 'major' : ''}`} />
        ))}
      </div>
      <div className="clock-date">
        <span>
          {DAYS[d.getDay()]}, {d.getDate()} {MONTHS[d.getMonth()]}
        </span>
        <span className="muted mono">W{isoWeek(d)}</span>
      </div>
      <div className="day-progress">
        <div className="day-progress-track">
          <div className="day-progress-fill" style={{ transform: `scaleX(${dayPct})` }} />
        </div>
        <span className="mono muted">{Math.floor(dayPct * 100)}% of day</span>
      </div>
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { fmtDuration } from '../format.ts';
import { Card } from './ui.tsx';

type Phase = 'idle' | 'focus' | 'break';
interface FocusState {
  phase: Phase;
  endsAt: number;
  doneToday: number;
  day: string;
}

const FOCUS_MS = 25 * 60_000;
const BREAK_MS = 5 * 60_000;
const KEY = 'diyboard.focus';

const dayKey = (t: number) => new Date(t).toDateString();

function load(now: number): FocusState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as FocusState;
    if (s.day === dayKey(now)) return s;
    return { ...s, doneToday: 0, day: dayKey(now) };
  } catch {
    return { phase: 'idle', endsAt: 0, doneToday: 0, day: dayKey(now) };
  }
}

function save(s: FocusState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: timer still works until reload */
  }
}

/** Tap-to-start pomodoro. Focus 25 min → break 5 min → idle. */
export function FocusCard({ now }: { now: number }) {
  const [s, setS] = useState(() => load(now));

  const update = (next: FocusState) => {
    save(next);
    setS(next);
  };

  // advance phases when the timer runs out
  useEffect(() => {
    if (s.phase === 'idle' || now < s.endsAt) return;
    if (s.phase === 'focus') update({ ...s, phase: 'break', endsAt: s.endsAt + BREAK_MS, doneToday: s.doneToday + 1 });
    else update({ ...s, phase: 'idle', endsAt: 0 });
  }, [now, s]);

  const onTap = () => {
    if (s.phase === 'idle') update({ ...s, phase: 'focus', endsAt: now + FOCUS_MS, day: dayKey(now) });
    else update({ ...s, phase: 'idle', endsAt: 0 });
  };

  const total = s.phase === 'focus' ? FOCUS_MS : BREAK_MS;
  const left = Math.max(0, s.endsAt - now);
  const pct = s.phase === 'idle' ? 0 : 1 - left / total;
  const mm = String(Math.floor(left / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');

  return (
    <Card className={`focus-card focus-${s.phase}`} delay={240}>
      <button className="focus-btn" onClick={onTap} aria-label={s.phase === 'idle' ? 'Start focus session' : 'Stop timer'}>
        <svg className="focus-ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r="27" className="focus-ring-track" />
          <circle cx="32" cy="32" r="27" className="focus-ring-fill" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - pct} />
          {s.phase === 'idle' ? <path d="M27 22 L43 32 L27 42 Z" className="focus-play" /> : <rect x="25" y="25" width="14" height="14" rx="3" className="focus-play" />}
        </svg>
        <div className="focus-text">
          <span className="focus-label">{s.phase === 'idle' ? 'Focus' : s.phase === 'focus' ? 'Deep work' : 'Break'}</span>
          <span className="focus-time tnum">{s.phase === 'idle' ? '25:00' : `${mm}:${ss}`}</span>
          <span className="small muted">
            {s.phase === 'idle' ? 'tap to start' : s.phase === 'focus' ? `until ${new Date(s.endsAt).toTimeString().slice(0, 5)}` : 'stretch, hydrate'}
          </span>
        </div>
        <div className="focus-count">
          <div className="focus-dots">
            {Array.from({ length: 4 }, (_, i) => (
              <i key={i} className={i < Math.min(4, s.doneToday) ? 'on' : ''} />
            ))}
          </div>
          <span className="small muted">
            {s.doneToday} today · {fmtDuration(s.doneToday * FOCUS_MS)}
          </span>
        </div>
      </button>
    </Card>
  );
}

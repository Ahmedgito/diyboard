import { useEffect, useRef, useState } from 'react';
import { Aurora } from './components/Aurora.tsx';
import { ClaudePanel } from './components/Claude.tsx';
import { Clock } from './components/Clock.tsx';
import { FocusCard } from './components/Focus.tsx';
import { GitHubPanel } from './components/GitHub.tsx';
import { SystemCard } from './components/System.tsx';
import { Toasts } from './components/Toasts.tsx';
import { native } from './native.ts';
import { useDashboard, useNow } from './useDashboard.ts';

const STAGE_W = 960;
const STAGE_H = 600;

/** Fit the fixed 960x600 design to any screen (the Tab A 8" is ~961x601 CSS px in landscape). */
function useStageScale() {
  const calc = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const onResize = () => setScale(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

/** Nudge the layout a couple of pixels every few minutes so static pixels don't sit forever. */
function pixelShift(now: number) {
  const step = Math.floor(now / 300_000) % 4;
  return [
    [0, 0],
    [2, 1],
    [1, 2],
    [-1, 1],
  ][step];
}

function isNight(now: number) {
  const h = new Date(now).getHours();
  return h >= 23 || h < 6;
}

/** How long the board stays at full brightness at night after the app opens, a tap, a reconnect or a toast. */
const WAKE_MS = 10 * 60_000;
const NIGHT_BACKLIGHT = 0.12;

/**
 * Night dimming that only kicks in when nobody is looking: the board is bright when it opens and
 * after any interaction, and dims after WAKE_MS of idle between 23:00 and 06:00.
 * The tap that wakes a dimmed board is swallowed so it doesn't also start the focus timer.
 */
function useNightDim(now: number, connected: boolean, toastCount: number) {
  const [awakeUntil, setAwakeUntil] = useState(() => Date.now() + WAKE_MS);
  const wake = () => setAwakeUntil(Date.now() + WAKE_MS);
  const dim = isNight(now) && Date.now() > awakeUntil;
  const dimRef = useRef(dim);
  dimRef.current = dim;

  useEffect(() => {
    let swallow = false;
    const onDown = () => {
      swallow = dimRef.current;
      setAwakeUntil(Date.now() + WAKE_MS);
    };
    const onClick = (e: Event) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('click', onClick, true);
    };
  }, []);

  // Plugging the tablet back in, or a new notification, should be readable.
  useEffect(() => {
    if (connected) wake();
  }, [connected]);
  useEffect(() => {
    if (toastCount > 0) wake();
  }, [toastCount]);

  // Dim the actual backlight (tablet only), not just the pixels.
  useEffect(() => {
    native?.setBrightness(dim ? NIGHT_BACKLIGHT : -1);
  }, [dim]);

  return dim;
}

export function App() {
  const { state, toasts } = useDashboard();
  const now = useNow(1000, state.clockOffset);
  const scale = useStageScale();
  const [dx, dy] = pixelShift(now);
  const firstName = state.github?.name?.split(' ')[0] ?? null;
  const dim = useNightDim(now, state.connected, toasts.length);

  return (
    <div className={`viewport ${dim ? 'night' : ''}`}>
      <Aurora now={now} />
      <div className="grain" aria-hidden />
      <main
        className="stage"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale})` }}
      >
        <div className="col col-left">
          <Clock now={now} name={firstName} />
          <SystemCard system={state.system} connected={state.connected} />
          <FocusCard now={now} />
        </div>
        <div className="col col-mid">
          <ClaudePanel stats={state.claude} now={now} />
        </div>
        <div className="col col-right">
          <GitHubPanel stats={state.github} />
        </div>
        <Toasts toasts={toasts} />
      </main>
    </div>
  );
}

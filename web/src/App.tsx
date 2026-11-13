import { useEffect, useState } from 'react';
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

export function App() {
  const { state, toasts } = useDashboard();
  const now = useNow(1000, state.clockOffset);
  const scale = useStageScale();
  const [dx, dy] = pixelShift(now);
  const firstName = state.github?.name?.split(' ')[0] ?? null;
  const night = isNight(now);

  // Dim the actual backlight at night (tablet only), not just the pixels.
  useEffect(() => {
    native?.setBrightness(night ? 0.03 : -1);
  }, [night]);

  return (
    <div className={`viewport ${night ? 'night' : ''}`}>
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

import { useEffect, useRef, useState } from 'react';
import type { ClaudeStats, GitHubStats, HelloMessage, SystemStats, Toast } from '../../shared/types.ts';
import { demoClaude, demoGitHub, demoSystem, demoToast } from './demo.ts';
import { native } from './native.ts';

export interface DashboardState {
  claude: ClaudeStats | null;
  github: GitHubStats | null;
  system: SystemStats | null;
  connected: boolean;
  /** serverTime - Date.now(): the laptop is the source of truth for the clock */
  clockOffset: number;
}

const SERVER_LOST_MS = 20_000;

export function useDashboard() {
  const [state, setState] = useState<DashboardState>({
    claude: null,
    github: null,
    system: null,
    connected: false,
    clockOffset: 0,
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lostTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('demo')) {
      const tick = () => {
        const now = Date.now();
        setState((s) => ({ ...s, connected: true, claude: demoClaude(now), github: demoGitHub(now), system: demoSystem(now) }));
      };
      tick();
      const id = window.setInterval(tick, 2000);
      // `/?demo=toast` shows a notification, for screenshots
      if (params.get('demo') === 'toast') window.setTimeout(() => setToasts([{ ...demoToast, at: Date.now() }]), 2500);
      return () => window.clearInterval(id);
    }

    const es = new EventSource('/api/stream');
    const on = <T,>(name: string, fn: (data: T) => void) =>
      es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data) as T));

    on<HelloMessage>('hello', (h) => setState((s) => ({ ...s, connected: true, clockOffset: h.serverTime - Date.now() })));
    on<ClaudeStats>('claude', (claude) => setState((s) => ({ ...s, claude })));
    on<GitHubStats>('github', (github) => setState((s) => ({ ...s, github })));
    on<SystemStats>('system', (system) => setState((s) => ({ ...s, system })));
    on<Toast>('toast', (t) => {
      setToasts((list) => [...list.slice(-3), t]);
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 8000);
    });

    es.onopen = () => {
      window.clearTimeout(lostTimer.current);
      lostTimer.current = undefined;
      setState((s) => ({ ...s, connected: true }));
    };
    es.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
      // EventSource retries by itself; if the laptop stays gone, hand back to the native offline screen.
      if (native && lostTimer.current === undefined) {
        lostTimer.current = window.setTimeout(() => native?.serverLost(), SERVER_LOST_MS);
      }
    };
    return () => {
      es.close();
      window.clearTimeout(lostTimer.current);
    };
  }, []);

  return { state, toasts };
}

/** Re-render every `ms` (aligned to wall clock) and return the current time. */
export function useNow(ms = 1000, offset = 0): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    let timer: number;
    const tick = () => {
      const t = Date.now() + offset;
      setNow(t);
      timer = window.setTimeout(tick, ms - (t % ms) + 5);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [ms, offset]);
  return now;
}

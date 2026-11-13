import type { ReactNode } from 'react';
import type { Toast, ToastKind } from '../../../shared/types.ts';
import { IconCheck, IconEye, IconMerge, IconSpark, IconUsb, IconX } from './icons.tsx';

const META: Record<ToastKind, { icon: ReactNode; tone: string }> = {
  merged: { icon: <IconMerge />, tone: 'tone-violet' },
  review: { icon: <IconEye />, tone: 'tone-warn' },
  'ci-fail': { icon: <IconX />, tone: 'tone-bad' },
  'ci-pass': { icon: <IconCheck />, tone: 'tone-good' },
  tablet: { icon: <IconUsb />, tone: 'tone-good' },
  claude: { icon: <IconSpark />, tone: 'tone-blue' },
  info: { icon: <IconSpark />, tone: 'tone-blue' },
};

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${META[t.kind].tone}`}>
          <span className="toast-icon">{META[t.kind].icon}</span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.detail && <div className="toast-detail">{t.detail}</div>}
          </div>
          <span className="toast-timer" />
        </div>
      ))}
    </div>
  );
}

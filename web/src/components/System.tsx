import { useEffect, useState } from 'react';
import type { SystemStats } from '../../../shared/types.ts';
import { fmtBytes, fmtDuration } from '../format.ts';
import { native, tabletBattery } from '../native.ts';
import { IconBattery, IconCpu, IconUsb } from './icons.tsx';
import { Card, CardHeader, Meter, Sparkline } from './ui.tsx';

function batteryColor(level: number, charging: boolean) {
  if (charging) return 'var(--good)';
  if (level <= 15) return 'var(--critical)';
  if (level <= 30) return 'var(--warning)';
  return 'var(--text-secondary)';
}

export function SystemCard({ system, connected }: { system: SystemStats | null; connected: boolean }) {
  const [tablet, setTablet] = useState(tabletBattery);
  useEffect(() => {
    if (!native) return;
    const id = window.setInterval(() => setTablet(tabletBattery()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const cpu = system ? Math.round(system.cpu) : 0;
  const memPct = system ? system.memUsed / system.memTotal : 0;

  return (
    <Card className="system-card" delay={120}>
      <CardHeader
        icon={<IconCpu />}
        title={system?.hostname ?? 'Laptop'}
        right={
          <span className={`pill ${connected ? 'pill-good' : 'pill-bad'}`}>
            <IconUsb width={12} height={12} />
            {connected ? 'USB live' : 'reconnecting'}
          </span>
        }
      />
      <div className="sys-cpu">
        <div className="row-between">
          <span className="muted small">CPU · last 2 min</span>
          <span className="sys-value tnum">{cpu}%</span>
        </div>
        <Sparkline values={system?.cpuHistory ?? []} width={254} height={50} color={cpu > 85 ? 'var(--serious)' : 'var(--series-1)'} />
      </div>
      <div className="sys-meter">
        <div className="row-between small">
          <span className="muted">Memory</span>
          <span className="tnum">
            {system ? fmtBytes(system.memUsed) : '–'} <span className="muted">/ {system ? fmtBytes(system.memTotal) : '–'} GB</span>
          </span>
        </div>
        <Meter value={memPct} color={memPct > 0.9 ? 'var(--serious)' : 'var(--series-3)'} />
      </div>
      {system?.disk && (
        <div className="sys-meter">
          <div className="row-between small">
            <span className="muted">Disk {system.disk.mount}</span>
            <span className="tnum">
              {Math.round(system.disk.used / 1024 ** 3)} <span className="muted">/ {Math.round(system.disk.total / 1024 ** 3)} GB</span>
            </span>
          </div>
          <Meter value={system.disk.used / system.disk.total} color={system.disk.used / system.disk.total > 0.9 ? 'var(--serious)' : 'var(--series-7)'} />
        </div>
      )}
      <div className="sys-foot">
        {system?.battery && (
          <span className="sys-batt" style={{ color: batteryColor(system.battery.level, system.battery.charging) }}>
            <IconBattery level={system.battery.level} charging={system.battery.charging} />
            <span className="tnum">Laptop {system.battery.level}%</span>
          </span>
        )}
        {tablet && (
          <span className="sys-batt" style={{ color: batteryColor(tablet.level, tablet.charging) }}>
            <IconBattery level={tablet.level} charging={tablet.charging} />
            <span className="tnum">Tab {tablet.level}%</span>
          </span>
        )}
        {system && <span className="muted mono sys-uptime">up {fmtDuration(system.uptime * 1000)}</span>}
      </div>
    </Card>
  );
}

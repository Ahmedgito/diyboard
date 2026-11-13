import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import { parse } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Samples laptop CPU / memory / battery. */
export class SystemCollector {
  private lastTimes = cpuTimes();
  readonly cpuHistory: number[] = [];
  cpu = 0;
  battery: { level: number; charging: boolean } | null = null;

  sampleCpu() {
    const now = cpuTimes();
    const idle = now.idle - this.lastTimes.idle;
    const total = now.total - this.lastTimes.total;
    this.lastTimes = now;
    this.cpu = total > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : 0;
    this.cpuHistory.push(Math.round(this.cpu));
    if (this.cpuHistory.length > 60) this.cpuHistory.shift();
  }

  async sampleBattery() {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await run(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress'],
          { windowsHide: true, timeout: 15_000 },
        );
        if (!stdout.trim()) return void (this.battery = null);
        const raw = JSON.parse(stdout);
        const b = Array.isArray(raw) ? raw[0] : raw;
        // BatteryStatus: 1 = discharging, 2 = on AC, 6-9 = charging states
        this.battery = { level: b.EstimatedChargeRemaining, charging: b.BatteryStatus !== 1 };
      } else if (process.platform === 'darwin') {
        const { stdout } = await run('pmset', ['-g', 'batt'], { timeout: 5_000 });
        const m = stdout.match(/(\d+)%;\s*(\w+)/);
        this.battery = m ? { level: Number(m[1]), charging: m[2] !== 'discharging' } : null;
      }
    } catch {
      this.battery = null;
    }
  }

  disk: { used: number; total: number; mount: string } | null = null;

  async sampleDisk() {
    const mount = parse(process.cwd()).root || '/';
    try {
      const s = await statfs(mount);
      const total = s.blocks * s.bsize;
      this.disk = { total, used: total - s.bavail * s.bsize, mount: mount.replace(/[\\/]$/, '') || '/' };
    } catch {
      this.disk = null;
    }
  }

  memory() {
    const total = os.totalmem();
    return { memUsed: total - os.freemem(), memTotal: total };
  }
}

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

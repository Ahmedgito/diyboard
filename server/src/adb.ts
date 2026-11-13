import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

function findAdb(): string {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  for (const root of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (root && existsSync(join(root, 'platform-tools', exe))) return join(root, 'platform-tools', exe);
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const p = join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe);
    if (existsSync(p)) return p;
  }
  return exe; // hope it's on PATH
}

interface Options {
  port: number;
  autoLaunch: boolean;
  component: string; // "pkg/.Activity"
  onConnect: (serial: string) => void;
  onDisconnect: (serial: string) => void;
}

/**
 * Watches for USB-connected Android devices. For each new device it maps the tablet's
 * localhost:PORT to this laptop (adb reverse) and optionally launches the dashboard app.
 */
export class AdbWatcher {
  readonly adb = findAdb();
  private readonly opts: Options;
  private readonly ready = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  available = true;
  serial: string | null = null;

  constructor(opts: Options) {
    this.opts = opts;
  }

  start(intervalMs = 3000) {
    const tick = () => this.tick().catch(() => {});
    tick();
    this.timer = setInterval(tick, intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async adbRun(args: string[]) {
    return run(this.adb, args, { windowsHide: true, timeout: 10_000 });
  }

  private async tick() {
    let stdout: string;
    try {
      ({ stdout } = await this.adbRun(['devices']));
      this.available = true;
    } catch {
      if (this.available) console.warn(`[adb] not available (${this.adb}). Tablet auto-setup disabled.`);
      this.available = false;
      return;
    }
    const online = new Set(
      stdout
        .split(/\r?\n/)
        .slice(1)
        .map((l) => l.trim().split(/\s+/))
        .filter((p) => p.length >= 2 && p[1] === 'device')
        .map((p) => p[0]),
    );

    for (const serial of this.ready) {
      if (!online.has(serial)) {
        this.ready.delete(serial);
        if (this.serial === serial) this.serial = null;
        console.log(`[adb] ${serial} disconnected`);
        this.opts.onDisconnect(serial);
      }
    }

    for (const serial of online) {
      if (this.ready.has(serial)) continue;
      try {
        const port = String(this.opts.port);
        await this.adbRun(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
        this.ready.add(serial);
        this.serial = serial;
        console.log(`[adb] ${serial}: tablet localhost:${port} -> laptop localhost:${port}`);
        if (this.opts.autoLaunch) {
          await this.adbRun(['-s', serial, 'shell', 'am', 'start', '-n', this.opts.component]).catch(() => {
            console.warn('[adb] could not launch app (is the APK installed? run `npm run apk`)');
          });
        }
        this.opts.onConnect(serial);
      } catch (err) {
        console.warn(`[adb] reverse failed for ${serial}: ${(err as Error).message.split('\n')[0]}`);
      }
    }
  }
}

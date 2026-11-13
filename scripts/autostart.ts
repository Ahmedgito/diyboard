// Start the DIY Board server automatically when you log in to Windows (hidden, no console window).
//   npm run autostart            -> install
//   npm run autostart -- --remove -> uninstall
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../server/src/config.ts';

if (process.platform !== 'win32') {
  console.log('Autostart helper is Windows-only. On macOS/Linux add `npm start` (in this folder) to your login items / systemd user units.');
  process.exit(0);
}

const startup = join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const file = join(startup, 'diyboard.vbs');

if (process.argv.includes('--remove')) {
  if (existsSync(file)) rmSync(file);
  console.log('✓ Autostart removed.');
  process.exit(0);
}

if (!existsSync(join(ROOT, 'web', 'dist', 'index.html'))) {
  console.error('Build the dashboard first: npm run build');
  process.exit(1);
}

const q = (s: string) => s.replace(/"/g, '""');
const command = `cmd /c ""${q(process.execPath)}" server\\src\\index.ts > diyboard.log 2>&1"`;
const vbs = [
  "' Starts the DIY Board server hidden at login. Created by `npm run autostart`.",
  'Set sh = CreateObject("WScript.Shell")',
  `sh.CurrentDirectory = "${q(ROOT)}"`,
  `sh.Run "${q(command)}", 0, False`,
  '',
].join('\r\n');

mkdirSync(startup, { recursive: true });
writeFileSync(file, vbs);
console.log(`✓ Autostart installed: ${file}`);
console.log(`  Logs go to ${join(ROOT, 'diyboard.log')}. Remove with: npm run autostart -- --remove`);

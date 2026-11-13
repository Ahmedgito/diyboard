// Build the Android shell, install it on the USB-connected tablet and launch it.
//   npm run apk            -> build + install + launch
//   npm run apk -- --build -> build only
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, ROOT } from '../server/src/config.ts';

const config = loadConfig();
const androidDir = join(ROOT, 'android');
const isWin = process.platform === 'win32';
const apk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

function adbPath() {
  const exe = isWin ? 'adb.exe' : 'adb';
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (isWin ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : '');
  const p = join(sdk, 'platform-tools', exe);
  return existsSync(p) ? p : exe;
}

console.log('› Building APK…');
if (isWin) {
  // .bat files must run through cmd.exe
  execFileSync('cmd.exe', ['/d', '/s', '/c', '.\\gradlew.bat assembleDebug --console=plain -q'], { cwd: androidDir, stdio: 'inherit' });
} else {
  execFileSync('./gradlew', ['assembleDebug', '--console=plain', '-q'], { cwd: androidDir, stdio: 'inherit' });
}
console.log(`✓ ${apk}`);

if (process.argv.includes('--build')) process.exit(0);

const adb = adbPath();
console.log('› Installing on tablet…');
execFileSync(adb, ['install', '-r', apk], { stdio: 'inherit' });
execFileSync(adb, ['reverse', `tcp:${config.port}`, `tcp:${config.port}`], { stdio: 'inherit' });
execFileSync(adb, ['shell', 'am', 'start', '-n', `${config.appPackage}/${config.appActivity}`], { stdio: 'inherit' });
console.log('✓ Installed and launched. Keep `npm start` running on the laptop.');

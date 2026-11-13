import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface Config {
  port: number;
  /** Launch the dashboard app on the tablet as soon as it is plugged in. */
  autoLaunch: boolean;
  appPackage: string;
  appActivity: string;
  claudeProjectsDir: string;
  githubEnabled: boolean;
  githubPollSeconds: number;
  /** Which `gh` login to show when several are signed in (`gh auth status`). Defaults to the active one. */
  githubUser: string | null;
}

const defaults: Config = {
  port: 7777,
  autoLaunch: true,
  appPackage: 'dev.diyboard.app',
  appActivity: '.MainActivity',
  claudeProjectsDir: join(homedir(), '.claude', 'projects'),
  githubEnabled: true,
  githubPollSeconds: 90,
  githubUser: null,
};

export function loadConfig(): Config {
  const file = join(ROOT, 'diyboard.config.json');
  if (!existsSync(file)) return defaults;
  try {
    const user = JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>;
    return { ...defaults, ...user };
  } catch (err) {
    console.warn(`[config] ignoring invalid diyboard.config.json: ${(err as Error).message}`);
    return defaults;
  }
}

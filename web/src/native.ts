// Bridge exposed by the Android shell (see android/app/src/main/java/.../MainActivity.java).
// Absent when the dashboard runs in a normal browser.

interface NativeBridge {
  getBattery(): string; // JSON {level, charging}
  serverLost(): void;
  setBrightness(value: number): void; // 0..1, or -1 for system default
}

declare global {
  interface Window {
    DiyBoardNative?: NativeBridge;
  }
}

export const native = typeof window !== 'undefined' ? window.DiyBoardNative : undefined;

export function tabletBattery(): { level: number; charging: boolean } | null {
  try {
    return native ? JSON.parse(native.getBattery()) : null;
  } catch {
    return null;
  }
}

// Argument checks for every IPC call from the renderer. Anything unexpected is refused before it
// reaches the controller.

import { GRAPHICS_PRESETS, type ExternalTarget, type GraphicsPreset, type Settings } from "../shared/types";

export function boundedString(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

export function settingsPatch(v: unknown): Partial<Settings> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const out: Partial<Settings> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k === "graphics" && GRAPHICS_PRESETS.includes(val as GraphicsPreset)) out.graphics = val as GraphicsPreset;
    else if (k === "windowed" && typeof val === "boolean") out.windowed = val;
    else if (k === "language" && (val === "en" || val === "fi")) out.language = val;
    else return null;
  }
  return out;
}

const TARGETS: readonly ExternalTarget[] = [
  "tailscale_download",
  "tailscale_share",
  "vc_redist",
  "server_source",
  "project_source",
  "project_license",
];

export function externalTarget(v: unknown): ExternalTarget | null {
  return TARGETS.includes(v as ExternalTarget) ? (v as ExternalTarget) : null;
}

// Hidden override for the relay port (tests and rehearsals on a PC where 61000 is taken).
export function relayPortOverride(v: string | undefined): number | undefined {
  if (typeof v !== "string" || !/^[1-9][0-9]{3,4}$/.test(v.trim())) return undefined;
  const n = Number(v.trim());
  return n >= 1024 && n <= 65535 ? n : undefined;
}

// Only the launcher's own page may call in: the packaged file:// page, or the Vite dev server.
export function isTrustedPageUrl(url: string, devServerUrl: string | undefined, rendererIndexUrl: string): boolean {
  if (typeof url !== "string") return false;
  if (devServerUrl) {
    try {
      return new URL(url).origin === new URL(devServerUrl).origin;
    } catch {
      return false;
    }
  }
  const strip = (u: string) => u.split("#")[0].split("?")[0].toLowerCase();
  return strip(url) === strip(rendererIndexUrl);
}

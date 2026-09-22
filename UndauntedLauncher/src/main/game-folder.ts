// "I already have the game files": finds an existing Dauntless 1.4.4 game from a folder the player
// pasted or picked (Vvoidddd, pull request #8). Only these layouts are tried; nothing is searched:
//
//   <folder>                    the game root, the folder that holds Archon\
//   <folder>\Dauntless          BaseGame144, the folder the 1.4.4 zip unpacks to
//   the folder above <folder>   when <folder> is Archon
//   three folders up            when <folder> is Archon\Binaries\Win64
//
// Only drive-letter paths are accepted, and that is checked before any file-system call: looking at a
// UNC path (\\host\share), a device path (\\?\, \\.\) or a root-relative one (\Games) would make
// Windows contact another machine, possibly with the player's network credentials. The root is kept
// as it was typed or picked (no realpath: a mapped drive stays a drive letter, a short 8.3 name stays
// short), and it may be at most MAX_GAME_ROOT characters long, the same limit as "Change folder...",
// so that the deepest game file stays within Windows' 260-character path limit.

import { promises as fsp } from "node:fs";
import path from "node:path";
import { EXE_RELATIVE_PATH } from "./constants";

export const MAX_GAME_INPUT = 260;
export const MAX_GAME_ROOT = 150;

export type GameFolderResult = { ok: true; root: string } | { ok: false; reason: "invalid_path" | "not_found" | "too_long" };

// The folder as a clean absolute drive-letter path, or null. Explorer's "Copy as path" adds quotes.
export function cleanGameFolderInput(input: string): string | null {
  let s = input.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).trim();
  if (s.length === 0 || s.length > MAX_GAME_INPUT || s.includes("\0")) return null;
  if (!/^[A-Za-z]:[\\/]/.test(s)) return null;
  return path.win32.resolve(s);
}

export function gameRootCandidates(folder: string): string[] {
  const out = [folder, path.win32.join(folder, "Dauntless")];
  const name = path.win32.basename(folder).toLowerCase();
  if (name === "archon") out.push(path.win32.dirname(folder));
  if (name === "win64") out.push(path.win32.resolve(folder, "..", "..", ".."));
  return out;
}

export async function locateExistingGame(input: string): Promise<GameFolderResult> {
  const folder = cleanGameFolderInput(input);
  if (folder === null) return { ok: false, reason: "invalid_path" };
  let tooLong = false;
  for (const root of gameRootCandidates(folder)) {
    try {
      if (!(await fsp.stat(path.win32.join(root, ...EXE_RELATIVE_PATH.split("/")))).isFile()) continue;
    } catch {
      continue; // not this layout
    }
    if (root.length <= MAX_GAME_ROOT) return { ok: true, root };
    tooLong = true;
  }
  return { ok: false, reason: tooLong ? "too_long" : "not_found" };
}

export async function findExistingGameRoot(input: string): Promise<string | null> {
  const r = await locateExistingGame(input);
  return r.ok ? r.root : null;
}

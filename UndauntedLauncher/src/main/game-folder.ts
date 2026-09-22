// Resolve a user-selected existing 1.4.4 game without walking the whole disk.
// The launcher always launches the pinned exe under <root>/Archon/Binaries/Win64.

import { promises as fsp } from "node:fs";
import path from "node:path";
import { EXE_RELATIVE_PATH } from "./constants";

export async function findExistingGameRoot(input: string): Promise<string | null> {
  let chosen = input.trim();
  if (chosen.startsWith('"') && chosen.endsWith('"')) chosen = chosen.slice(1, -1).trim();
  if (!chosen || chosen.length > 512 || chosen.includes("\0") || !path.isAbsolute(chosen)) return null;

  const selected = path.resolve(chosen);
  const candidates = [selected, path.join(selected, "Dauntless")];
  if (path.basename(selected).toLowerCase() === "archon") candidates.push(path.dirname(selected));
  if (path.basename(selected).toLowerCase() === "win64") candidates.push(path.resolve(selected, "../../.."));

  for (const candidate of candidates) {
    try {
      const root = await fsp.realpath(candidate);
      const exe = path.join(root, ...EXE_RELATIVE_PATH.split("/"));
      if ((await fsp.stat(exe)).isFile()) return root;
    } catch {
      // Try only these known layouts; never recurse through arbitrary folders.
    }
  }
  return null;
}

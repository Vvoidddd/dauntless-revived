import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findExistingGameRoot } from "../src/main/game-folder";
import { EXE_RELATIVE_PATH } from "../src/main/constants";

test("finds the pinned game layout from BaseGame144, Dauntless, Archon or Win64", async () => {
  const base = mkdtempSync(path.join(tmpdir(), "dr-existing-game-"));
  try {
    const game = path.join(base, "Dauntless");
    const exe = path.join(game, ...EXE_RELATIVE_PATH.split("/"));
    mkdirSync(path.dirname(exe), { recursive: true });
    writeFileSync(exe, "fixture");
    for (const selected of [base, game, path.join(game, "Archon"), path.dirname(exe), `"${base}"`]) {
      assert.equal(await findExistingGameRoot(selected), game, selected);
    }
    assert.equal(await findExistingGameRoot(path.dirname(game)), game);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("rejects unrelated folders and missing game executables", async () => {
  const base = mkdtempSync(path.join(tmpdir(), "dr-not-game-"));
  try {
    mkdirSync(path.join(base, "Dauntless", "Archon"), { recursive: true });
    assert.equal(await findExistingGameRoot(base), null);
    assert.equal(await findExistingGameRoot("relative\\BaseGame144"), null);
    assert.equal(await findExistingGameRoot("\0"), null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

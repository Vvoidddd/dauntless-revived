---
title: Upgrade notes
parent: Setup
nav_order: 6
description: "What changes for players when you update an existing Dauntless Revived server: real progression is now on by default. How to keep old max ranks, start fresh, or stay on the stub."
lang: en
ref: setup/upgrading
---

{% assign host_page = site.pages | where: "path", "setup/host.md" | first %}
{% assign admin_page = site.pages | where: "path", "setup/admin.md" | first %}
{% assign winserver_page = site.pages | where: "path", "setup/windows-server.md" | first %}
{% assign roadmap_page = site.pages | where: "path", "roadmap.md" | first %}

# Upgrade notes
{: .no_toc }

Read this before you update a server that already has players. Each note says what changes, what
your players will see, and what you can do about it. The newest change is first.

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Real progression is on by default {#real-progression-default}

**September 2026.** Applies to every server updated to a version where real progression is the
default, if the metagame's settings have no `PROGRESSION_MODE` line, an empty one, or a value other
than `real` or `stub`. You can tell the new version by its startup line, which begins
`Progression mode: real for every account`. Values such as `off`, `0` or `false` used to mean the
stub and now mean real. If you only set `PROGRESSION_REAL_ACCOUNTS` to try real progression on
chosen accounts, every other account now switches too: add `PROGRESSION_MODE=stub` to keep that
split.

### What changed

Before, the metagame answered every progression request with upstream Undaunted's stub unless
`PROGRESSION_MODE=real` was set:

- every account showed Slayer level 50 and maxed mastery, and nothing a player earned was stored;
- the Hunt Pass reported 99,999,999 with every reward already claimed, and the stub lists no
  entitlements, so the Elite track most likely showed as locked;
- the "Claim your Hunt Pass rewards" tutorial quest could never complete.

Now **an unset or empty `PROGRESSION_MODE` means real progression for every account**:

- Slayer level, weapon and behemoth mastery and their objectives start from the beginning
  (Slayer level 1, no mastery) and are saved from hunts and quests.
- The Hunt Pass (season 9b) starts empty. Claims on the free and the Elite track are saved. Every
  account owns the Elite pass by default (the `ENTITLEMENTS_DEFAULT` list).
- Rank rewards are granted once, by the game server, through the inventory. The metagame only
  records the claim.
- Entitlements, loadout slots, cooldowns and bounties are stored per account in the same mode.

`PROGRESSION_MODE=stub` still gives upstream's behaviour, and `PROGRESSION_REAL_ACCOUNTS` still
lists accounts that get real progression in stub mode (outside stub mode it is ignored). Any other
value is logged as a warning and treated as real; before this change it meant the stub.

**What has been tested.** A tester played in real mode on a throwaway account, then restarted
everything and logged in again ([roadmap]({{ roadmap_page.url | relative_url }}) items 2.8 to 2.12,
2.14 and 2.15): levels from 1, Slayer and weapon (axe) mastery rank-ups confirmed with each reward
granted once, no endless mastery pop-up, Hunt Pass claims on the free and the Elite track, an
entitlement granted by the game server, and all of it still there after the restart. **Not tried
yet:** behemoth mastery (it uses the same storage as weapon mastery), the extra loadout slots in the
UI, drafting and claiming bounties in the UI, cooldowns across a daily reset, several players at
once, and moving an account that already played under the stub's fake level 50 down to level 1
(roadmap item 2.13). With several players, note that a player's own client now gets 403 when it
asks for another account's progression, where the stub answered with the asking player's own data.
Escalation is still upstream's stub in both modes.

### What your players will see

**Nothing is migrated automatically.** A player who played on your server before the update has no
stored progression, so they start at **Slayer level 1 with an empty Hunt Pass**, like a new player.

- Their items should stay, including anything the fake level 50 handed out (alternate weapons,
  weapon unlock tokens). The update does not touch the inventory, but this has not been tried in game
  yet.
- Level 1 locks again what the fake 50 unlocked: consumable slots (ranks 2, 4 and 7), some crafting,
  and the hunts gated on Slayer level. Extra loadout slots never worked on the stub (it reports one
  slot); with real progression they come with ranks 34, 38 and 45 (not tried in the UI yet).
- Daily and weekly limits (cooldowns) now carry over between hunts and restarts. The stub forgot them
  each time a server loaded the player. If a limit never clears, `PROGRESSION_MODE=stub` is the
  fallback while you report it.

At startup the metagame logs its mode and, while such players exist, a warning with their count:

```
Progression mode: real for every account (the default)
3 player account(s) have no stored progression yet: they start at Slayer level 1 with an empty Hunt Pass, not upstream's fake max ranks. Nothing was migrated. ...
```

The count is of accounts that own a character but have no stored progression. An admin account that
never played is not counted, and a player drops out of the count once they earn anything or you
seed them. On a new server the count also includes players who have just created a character and
not earned any XP yet. For them the warning is harmless, and it goes away once they earn their first
XP.

### Choose what happens, before your players log in

| You want | Do this |
|:---------|:--------|
| Everyone starts fresh (what we chose for our own server) | Nothing. Tell your players that levels and the Hunt Pass start over and are kept from now on. |
| One player keeps max ranks | Seed them with `grandfather` while they are offline (below). Every track is set to its maximum rank and confirmed there, so nothing is granted and nothing pops up. Their Hunt Pass reads fully claimed. |
| Keep the old stub for now | Add `PROGRESSION_MODE=stub` to the metagame's settings and restart the metagame. `PROGRESSION_REAL_ACCOUNTS=<id>,<id>` gives chosen accounts real progression meanwhile. |

A `fresh` seed sets every track to 0 and clears the stored objectives. A player with no stored
progression is already at 0, so you only need `fresh` to reset an account that has real
progression already, such as a test account. The seed changes only that account's progression rows
and records the change in the `progression_events` table. The `grandfather` seed is covered by unit
tests but has not been tried in game yet.

**Take a backup first.** The metagame runs its database migrations at startup. The server kit backs
up around every update; on a hand-built host, see
[Back up the database]({{ admin_page.url | relative_url }}#back-up-the-database).

### Where the setting lives

- **Hand-built host** ([Host a server]({{ host_page.url | relative_url }})): `.env` in the
  `UndauntedMetagame` folder. Restart the metagame after a change.
- **Windows server kit** ([Windows server kit]({{ winserver_page.url | relative_url }})):
  `C:\DauntlessRevived\data\config\metagame.env`. The installer and `Update-DauntlessServer.ps1` keep
  every setting already in that file (the installer rewrites only the keys that describe the host,
  and neither keeps comment lines), so a server that already had `PROGRESSION_MODE=real` or `stub`
  keeps it. To stay on the stub, add the line **before** you update, or add it afterwards and run
  `C:\DauntlessRevived\bin\Stack.ps1 restart -Only metagame`. Unless the file says `real` or `stub`,
  the updater repeats the metagame's warning about players without stored progression after a
  successful update.
- **Restores and rollbacks follow the same rule.** A restore from a backup taken before this change,
  or a rollback to a build from before it (the updater's automatic rollback, or
  `Update-DauntlessServer.ps1 -Rollback`), uses the settings as they are. With no line, an older
  build means the stub again (players see the fake level 50; their stored progression stays in the
  database), and a newer build means real. Set `PROGRESSION_MODE=real` or `stub` explicitly if you
  want the mode fixed across restores and rollbacks.

### Seeding a player

Admin routes are refused through the public gateway (or any other proxy), so run this on the server
itself, with an admin account key. Save it as `seed-progression.js` anywhere on that machine; it
needs Node 18 or newer and nothing else:

```js
// node seed-progression.js <admin key file> list
// node seed-progression.js <admin key file> <UserId> grandfather|fresh
// Optional: set METAGAME to the metagame's address if it does not listen on 127.0.0.1:61000.
const fs = require("fs");
const [keyFile, userId, mode] = process.argv.slice(2);
const base = (process.env.METAGAME || "http://127.0.0.1:61000") + "/undaunted/api";
const key = fs.readFileSync(keyFile, "utf8").trim();

async function call(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { "x-undaunted-user-api-key": key, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${method} ${path} returned HTTP ${r.status}`);
  return r.json();
}

(async () => {
  if (userId === "list") {
    const { Users } = await call("GET", "/GetAllUsers");
    for (const u of Users) {
      const p = await call("GET", "/Progression?UserId=" + encodeURIComponent(u.UserId));
      const slayer = p.Tracks.find((t) => t.progression_id === "MasteryTrack_PlayerLevel");
      const pass = p.Tracks.find((t) => t.progression_id === "season09b");
      console.log(`${u.UserId}  ${u.Username}  real=${p.RealMode}  slayer=${slayer.earned_free_rank}  huntpass=${pass.progress}`);
    }
    return;
  }
  if (!userId || (mode !== "grandfather" && mode !== "fresh")) throw new Error("usage: see the first lines of this file");
  const r = await call("POST", "/SeedProgression", { UserId: userId, Mode: mode });
  console.log(`${r.UserId}: seeded ${r.Mode}, ${r.Tracks.length} tracks, real mode ${r.RealMode}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
```

**Hand-built host.** The admin key file is `C:\dr\data\owner.key` if you followed
[Host a server]({{ host_page.url | relative_url }}). If you followed
[Run it for a group]({{ admin_page.url | relative_url }}), the metagame listens on your Tailscale
address instead of `127.0.0.1`, so set `METAGAME` first:

```powershell
$env:METAGAME = "http://100.x.y.z:61000"   # the metagame's BIND_HOST
node seed-progression.js C:\dr\data\owner.key list
```

**Kit server.** Run it in an elevated PowerShell (Run as administrator): `owner.key` is readable only
by Administrators. In private mode the kit's metagame listens on the server's Tailscale address;
these lines read the address and port from the kit's configuration and work in both modes:

```powershell
$cfg = Get-Content C:\DauntlessRevived\data\config\server.json -Raw | ConvertFrom-Json
$port = if ($cfg.Ports.metagame) { $cfg.Ports.metagame } else { 61000 }
$env:METAGAME = "http://$($cfg.BindAddress):$port"
node seed-progression.js C:\DauntlessRevived\data\keys\owner.key list
node seed-progression.js C:\DauntlessRevived\data\keys\owner.key UID-... grandfather
```

`list` prints every account with its Slayer level as the game will show it and its Hunt Pass XP. It
answers `real=false` for accounts that are still on the stub (with `PROGRESSION_MODE=stub`); a seed
is stored either way and used once the account is in real mode. The script never prints the key.

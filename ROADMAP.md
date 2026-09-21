# Dauntless Revived: roadmap

Our fork of [Undaunted](https://github.com/SyST3MDeV/Undaunted) (AGPL-3.0). It runs the genuine Dauntless 1.4.4 client, and our work is on branch `dauntless-revived`.

**Goal:** a small group of friends plays together on this server, and everything they earn is kept.

**Effort sizes:**
- **S**: hours
- **M**: a day or two
- **L**: a week or more
- **XL**: research with no known end

`docs/roadmap.md` is a copy of this file. After changing this file, regenerate it with `node tools/sync-roadmap.js`.

## Done

- [x] Verified the 1.4.4 build: 406/406 files match Phoenix's manifest, binaries unmodified, malware scan clean
- [x] Installed at `C:\D144`; prebuilt server DLLs checked against pinned hashes before use
- [x] Whole stack running locally: metagame (`:61000`), deploy server (`:61001`), game servers (UDP 8770–8777)
- [x] Log in with your own account — no Epic account needed
- [x] Tutorial → Ramsgate on our own server
- [x] Max graphics (Cinematic, native resolution, sharpening) forced by the launcher
- [x] Fork fixes:
  - [x] Metagame and deploy server listen on this PC only by default (upstream exposed both; the deploy server has no auth)
  - [x] A port clash is now a hard error instead of a silent "Clear Skies" and exit
  - [x] Request log for every call (`gs=1` marks game-server calls)
  - [x] Training Dojo starts on demand instead of always costing a game process
- [x] Fork committed and pushed: 3 commits on top of upstream `7f692aa`, remote `origin` = github.com/mixutin/dauntless-revived
- [x] First pursuit hunt played on our server (the tutorial pursuit, `CR19_PlayerHunt_FTUE_Pursuit_Beta_LeRawr`, 10:36 UTC). Its loot, Rams, quest steps and hunt counter were saved.
- [x] Saved-data audit of every system (the table below), checked against the live database and the request log

## Where we are (2026-09-21, 10:50 UTC)

> **Update, 2026-09-21 afternoon:**
> - The owner played two real hunts (a Lesser Boreus hunt and a pursuit). The loot was saved: `CURRENCY_NOTES` went from 1,260 to 1,460 and `ORB_FROST` ×20 arrived.
> - Saves survive a full restart of everything (0.3), and the game no longer contacts Epic's chat server (0.5).
> - Backups are automatic: hourly, plus around every server start and stop, and a restore test passed (0.1).
> - The docs site is live at https://mixutin.github.io/dauntless-revived/.
> - The friend kit is built (1.14). It waits for Tailscale and invite codes.
> - Body capture is switched on (0.4). It fills on the next play session.
> - M2 (real progression, Hunt Pass with Elite for everyone, entitlements, cooldowns, bounties, loadout slots, save hardening) is built and **passed its in-game test** on a throwaway account, including a full restart. Accounts are switched over next (2.13).
> - Once, the Ramsgate server exited at the end of a hunt, and the deploy server's watchdog restarted it within a minute ("RAMSGATE HAS FALLEN! Restarting!"). It was a clean exit: no crash dump and no error in the Windows event log. The likely cause is its console window being closed. For ports 8776 and up (Ramsgate, Dojo) the DLL turns off its idle exit and opens a console for logging (`dllmain.cpp`, `AllocConsole`). Closing that window ends the server. Hiding the window is part of 1.1.

- **One player (the owner), on this PC.** These all work: login, the tutorial, Ramsgate, the Training Dojo, the first pursuit hunt, crafting, the inventory and the equipped loadout.
- **Friends can't connect yet.** Everything listens on this PC only, and parties and the friends list are fakes.
- **Some of what you earn is saved and some isn't.**
  - Saved: items, Rams, quests and gear.
  - Not saved: Slayer level, mastery, the Hunt Pass, bounties, daily timers and escalation. These are fakes that throw every save away.
- **There is no backup.** Every save lives in one 140 KB file (`C:\dr\data\undaunted.db`). Database changes (migrations) run automatically each time the server starts, with no copy taken first.

What today's session sent to the server (`metagame.log`, 09:38–10:50 UTC):

| Kept | Thrown away |
|---|---|
| 90 character saves. The final version in the database (76) matches the last save in the log. | 7 XP grants, all refused with 400 |
| 20 inventory transactions from game servers | 1 Hunt Pass XP grant, sent to a route that doesn't exist (404) |
| 5 loadout saves | 7 bounty saves and 7 cooldown saves (fake "OK" answers) |
| 12 "seen this" markers | 1 entitlement grant |
| | 43 loadout-slot unlock attempts (404) |

### What saves today

"Checker" marks the places where a second reviewer re-checked the claim and disagreed with it or narrowed it.

| System | Saves? | Notes |
|---|---|---|
| Account, login key, admin flag | Yes | Stored on disk. It survives a full restart: tested (0.3). A lost key can't be recovered (1.7). |
| Username | Partly | It is saved but can't be changed, and two players can take the same name. Some responses send the name as `{}`. |
| Quests, story, tutorial, flags, appearance (character data) | Yes, solo | There were 14 save conflicts today. After each one the client read the data again and its retry succeeded within about a second, so the last write is in the database. *Checker: not proven lossless if the client and a server change the same value at the same moment. Not tested with two players.* |
| Recent players; daily and weekly rotations (heroic queue, weekly challenges, cell offerings) | Probably | Stored inside the character data (the `RecentPlayers` key exists and is empty). Not checked in play. |
| Materials, Rams (`CURRENCY_NOTES`), tokens | Yes | 39 stacks, including `CURRENCY_NOTES` ×1,260. A retried request could grant twice, and spending more than you own isn't refused (2.2). |
| Weapons, armour, parts, cosmetic items | Yes | 36 items. Upgrades are version-checked. |
| Equipped gear, emotes, banner, glider, flare (loadout slot 0) | Yes | The database shows `WP_MS_BEGINNER` equipped, not the default. |
| Titles, pets, dyes, transmog, other cosmetics | Probably | Stored in the same records, but not verified (3.4). |
| Extra loadout slots | No | The route is missing: 43 failed unlock attempts today. |
| "Seen" markers (NPCs, tutorial slates) | Yes | All 12 from today are in the database. |
| "New" markers (breadcrumbs) | Yes, untested | The client hasn't written one yet. |
| Slayer level | No, faked at 50 | 7 XP grants were refused (400) today. |
| Weapon and behemoth mastery | No, faked at max | *Checker: only the overall behemoth track shows max. The individual behemoth mastery cards probably show nothing completed, because the objectives list is empty.* |
| Mastery objectives, achievements | No | |
| Hunt Pass | No, faked | The rank is sent as 99,999,999 (the real cap is 50). A 100-XP Hunt Pass grant at 10:41 hit a missing route. *Checker: nobody has seen what the Hunt Pass screen actually shows. The Elite track is probably locked.* |
| Bounties | No | The board is empty every time a server loads you. *Checker: claiming a bounty fails even within one session, because the route `/bounty/delete` is missing.* |
| Daily and weekly limits (cooldowns) | No | They reset each time a new server loads you, which means every hunt and every Ramsgate visit. |
| Escalation | No, faked at 99,999 | There is no save route. |
| Entitlements (Elite pass, packs) | No | One grant was thrown away today (09:50:31). |
| Currency balance (`/balance`) | Wrong | Reports 0 Notes, 25 weapon tokens and 0 of everything else. Your real Rams are in the inventory. |
| Store | Broken | The item list returns 400 (15 times today). |
| Mailbox | Always empty | |
| Guild | No | |
| Party, friends list | No, being built elsewhere | |
| Trials times, leaderboards, event stats | No | |
| Backups | Yes, on this PC | *Update: hourly, plus around every start and stop, with a restore test passed (0.1). There are no copies off this PC yet (0.2).* |

### What to tell friends right now

- Items, materials, Rams, crafted gear, quests and story progress are saved.
- Slayer level, weapon mastery, the Hunt Pass and bounties are not saved yet. Everyone shows as max level for now.
- Don't break cells down into dust yet. Nobody has checked whether the dust is kept.
- Quit the game at least once a day. Login tokens expire after 24 hours, and saves after that point may fail (1.8).

---

## Milestones

| | Milestone | Rough size |
|---|---|---|
| **M0** | Safety net: do this before changing anything | about a day |
| **M1** | Play together | 1–2 weeks of our own work, plus the parties work happening elsewhere |
| **M2** | Everything you earn is saved | 3–5 weeks |
| **M3** | The full game loop | many weeks; some parts are XL |
| **M4** | Solid to run | 1–2 weeks |

**Order of work (after decision 2):** friends are invited only once M2 lands, so after M0 we build **M2 (everything you earn is saved)** first. That can be built and tested with the owner alone.
**Parties (1.9)** are built alongside M2 and tested with a second account in a second game window on this PC. The rest of M1 (Tailscale, invite codes, usernames, the friend package) is prepared in parallel.
**1.15 First friends night** waits until M2 is done.

**Rules for all milestones:**
- Take the steps in order within a milestone. Steps from different milestones can overlap where their "Needs" allow it.
- Test every new server response on a throwaway account before the owner's account uses it. A wrong response shape can crash the 1.4.4 client ("Trying to resize TArray to an invalid size").
- Only migrate the live database while nobody is playing, and back it up right before.

### M0: Safety net

- [x] **0.1 Automatic database backups** (S) — ✅ **Done 2026-09-21.** The hidden hourly scheduled task "Dauntless Revived backup" keeps the newest 48 plus the newest of each of the last 30 days. `stack.ps1` also backs up after every stop and before every start, and won't start the metagame if that backup fails, so migrations never run without a copy. Restore test passed: a backup copied to a scratch folder passed `integrity_check` and held the owner's character at the live version (114) with an identical inventory. *Still open: copies off this PC. They contain the keys, so they belong with 0.2 (encrypted).*
  - **What:**
    - A script that copies the save file with SQLite's online backup. That is safe while the server runs. Never copy the live file by hand.
    - It checks each copy with `PRAGMA integrity_check`.
    - It keeps 48 hourly and 30 daily copies, and copies the dailies off this PC (OneDrive, a USB stick or a friend's PC).
    - It runs hourly while you host, at every start (before migrations run), at every stop, and before any update.
  - **You'll notice:** nothing, until something breaks. Then it's the difference between losing an hour and losing everything.
  - **Why first:** every save is in one file with no copy, and `migrate()` runs at every start without taking a snapshot.
  - **Needs:** nothing.
  - **Done when:** a backup restored into a scratch folder passes the integrity check and shows the owner's character at its latest version.

- [ ] **0.2 Back up the secrets** (S)
  - **What:** encrypted copies of `UndauntedMetagame\.env` (token signing keys), `C:\dr\data\gameserver.key` and `owner.key`, stored separately from the database backups.
  - **You'll notice:** if `owner.key` is lost, you are locked out of your own account. Only a hash of the key is stored.
  - **Done when:** the encrypted archive opens on another machine.

- [x] **0.3 Restart test** (S) — ✅ **Passed 2026-09-21.** All 12 tables were byte-identical before and after a full restart of the metagame, deploy server and Ramsgate server (row counts and content checksums). Startup migrations changed nothing. The client then logged in and loaded its character and inventory.
  - **What:** when nobody is playing, stop and start the metagame once. Log in with `owner.key` and check that the character loads at the same version.
  - **Why:** "your account survives a restart" is only inferred from the code. The account was registered after the running metagame started (log line 5), and the metagame hasn't restarted since.
  - **Needs:** 0.1.
  - **Done when:** login works after the restart and the character version hasn't changed.

- [ ] **0.4 Record what the game sends to the fake systems** (S) — *The capture is built (`LOG_BODIES=1`, `BODY_LOG_FILE`; bodies capped at 8 KB, tokens removed) and has been switched on since 2026-09-21. It fills during the next play session. Meanwhile the formats are being read from the binary.*
  - **What:**
    - Behind a switch in `.env`, write the JSON body (up to 8 KB) of every request to the stubbed or missing save routes into a separate log. That covers `POST /progression*`, `POST /bounty*`, `PUT /cooldown*`, `POST /entitlementv2*`, `/escalation*` and `/loadout/*/unlock/*`.
    - Also log the query string of `GET /product/skus/public`.
    - Then play one normal session and one real hunt, keeping the current 400 answer on progression while you do.
  - **Why:** the formats of these saves are guesses today, and building on a guess can crash the client. One capture answers several of the unknowns at the end of this document.
  - **You'll notice:** nothing.
  - **Done when:** the capture log holds at least one body for each of these: the XP grant, the Hunt Pass grant (`/progression/…/season09b/100`), a bounty save, a cooldown batch and an entitlement grant.

- [x] **0.5 Stop the game phoning Epic's chat server** (S) — ✅ **Verified 2026-09-21.** 90 s after launch: zero connections outside this PC; the client tried the local port 61099 instead.
  - **What:** 1.4.4 ships with chat and presence (XMPP) pointed at `wss://xmpp-service-prod.ol.epicgames.com:443` and keeps reconnecting to it, sending the account id and our login token. We confirmed a live connection from the client to that host. The launcher now rewrites `[OnlineSubsystemMcp.XMPP]` in the user `Engine.ini` to `ServerAddr="ws://127.0.0.1"`, `ServerPort=61099`, `bUseSSL=false`. Nothing listens there yet, so the connection fails exactly as it already does against Epic, which the game tolerates. A local presence server can take that port later (3.10).
  - **You'll notice:** nothing.
  - **Done when:** watching the client's connections for 90 s after a fresh launch shows nothing outside this PC. The friend package (1.14) must carry the same override.

### M1: Play together

- [ ] **1.1 One-command start / stop / status** (S) — *`stack.ps1 status|start|stop|restart` works locally and keeps old logs; not yet packaged.*
  - **What:** `C:\dr\tools\stack.ps1 start|stop|restart|status`.
    - **start:**
      1. Take a backup (0.1).
      2. Check that TCP 61000/61001 and UDP 8770–8777 are free.
      3. Kill leftover game servers. Only kill processes whose command line contains `-server`, because the owner's own client is the same exe.
      4. Check that the endpoint block in the owner's `Game.ini` points at `127.0.0.1:61000`. Game servers read their backend address from there.
      5. Start the metagame from its own folder (the migrations path is relative) and wait for `/dauntless-status`.
    - **stop:**
      1. Stop the deploy server first, otherwise it respawns Ramsgate.
      2. Stop the game servers, then the metagame.
      3. Take a final backup.
    - **status:** process IDs, memory per server, who is online.
    - **Also try:** start servers with `windowsHide` to hide their console windows. Closing one of those windows kills that server for everyone in it.
  - **You'll notice:** a server left over from a crash can no longer hold a port and send players to the wrong or a dead server.
  - **Needs:** 0.1.
  - **Done when:** stop, then start from cold, brings Ramsgate up on 8777 and the owner can log in with no manual steps.

- [ ] **1.2 Keep the PC up during play** (S)
  - **What:** Windows Update active hours are 8–17 today. Set them to cover your evenings, or pause updates before game nights. Sleep and hibernate are already off.
  - **You'll notice:** no surprise reboot that drops everyone mid-hunt.
  - **Done when:** active hours cover your usual play time.

- [ ] **1.3 Share the PC with friends over Tailscale** (S)
  - **What:**
    - Install Tailscale. Share only this machine with each friend's own Tailscale account; don't add them to your tailnet.
    - Add inbound firewall rules limited to 100.64.0.0/10 on the Tailscale adapter: UDP 8770–8777 for the game exe and TCP 61000 for node. Today there are no inbound rules at all.
    - Keep the Tailscale adapter on the Public network profile.
  - **You'll notice:** friends can reach the server at all.
  - **Done when:** from a friend's PC, `http://<100.x>:61000/dauntless-status` answers, and `tailscale ping` shows a direct path (not a relay).

- [ ] **1.4 Point the servers at the Tailscale address** (S)
  - **What:**
    - Set the deploy server's `MY_IP` and the metagame's `QOS_TARGET_URL` to the 100.x address. Both are 127.0.0.1 today.
    - Make the metagame listen on both 127.0.0.1 (for the host's game servers and the owner's client) and 100.x, by letting `BIND_HOST` take a list.
    - Keep the deploy server on 127.0.0.1; it has no login check.
  - **You'll notice:** without this, a friend's game is told to connect to 127.0.0.1, which is their own PC.
  - **Needs:** 1.3, and 1.5 must be done first.
  - **Done when:** a friend's client matchmakes into Ramsgate and the log shows their requests.

- [ ] **1.5 Invite codes on** (S)
  - **What:**
    - Set `REGISTRATION_MODE=INVITECODE` in `.env`. Changing it through the admin API only lasts until restart (`undauntedapi.ts:13`).
    - Write `invite.ps1` to create single-use codes, list them and revoke them.
    - Check the username before the code is used up.
    - Put the two account inserts into one transaction (`controllers/undauntedapi.ts:104` and `:110`), so a crash can't leave an account without a key.
  - **You'll notice:** only people you invite can make accounts.
  - **Done when:** registering without a valid code is refused, and a used code can't be used again.

- [ ] **1.6 Usernames** (M) — *Owner request (2026-09-21): confirmed wanted before friends join.*
  - **What:**
    - Names are 3–16 characters: letters, numbers and underscore.
    - Names are unique regardless of upper or lower case (a migration adds a unique index on the lowercase name).
    - A rename, for yourself or by the admin, updates `users.name` and `characters.name` together.
    - A "name available?" check for the friend script.
    - Rename the owner from the placeholder "Slayer".
    - Fix the display name that `eos.ts` and `party.ts` send as `{}` (a missing `await`).
  - **You'll notice:** your own name over your head, and never two "Slayer"s.
  - **Needs:** 1.5.
  - **Done when:** registering "slayer" while "Slayer" exists is refused, and a renamed player shows the new name after logging in again.

- [ ] **1.7 Lost-key recovery** (S)
  - **What:** an admin re-key that makes a new key, updates `userapikeys.keyHash` and shows the key once, plus a `rekey.ps1` script.
  - **Don't** re-key through `userapikeystoregister`. At boot it deletes the pending key first, then the insert fails on the primary key, and the metagame most likely never starts (`server.ts:16-24`).
  - **You'll notice:** a friend who reinstalls Windows keeps their Slayer.
  - **Done when:** a test account gets a new key and logs in with it, and the old key no longer works.

- [ ] **1.8 Saves keep working in long sessions** (S)
  - **What:**
    - Login tokens expire after 24 hours (`controllers/auth.ts:56`). Game-server saves carry the player's token, and the check at `middleware/HasUndauntedMetagameAuth.ts:19` has no error handling, so after 24 hours those saves fail with a server error.
    - Fix: give tokens a longer life (for example 30 days) or support the refresh request.
    - An expired token should get a logged 401 instead of a server error.
  - **You'll notice:** a friend who leaves the game open overnight in Ramsgate keeps what they earn afterwards.
  - **Done when:** on a test account with a 5-minute token, a save after 6 minutes either succeeds or fails with a logged 401. It must never be a silent 500.

- [ ] **1.9 Parties and friends list** (L — contract fully mapped)
  - **What:** real parties (today a party is always "you, alone"), a friends list and blocklist (`GET /friends/api/public/{friends,blocklist}` return 404 today), and presence. The contract is mapped from the 1.4.4 client: parties, invites and the friends list are plain HTTP routes (party and invite state in memory, friendships and blocks in SQLite). Showing friends as **online** needs a small XMPP presence server (optional, 3.10). Build order: account-lookup fixes, the party and invite loop, putting the whole party on one hunt server, then friends. Test with a second account and a second client on this PC.
  - **You'll notice:** you can invite a friend and go into a hunt together on purpose.
  - **Stopgap until then:** friends who queue the same hunt within 20 seconds land on the same server, up to 4 players (`controllers/matchmaking.ts:72-108`).
  - **Done when:** at minimum, two friends form a party in Ramsgate and land in the same hunt.

- [ ] **1.10 Cancelling matchmaking works** (S) — *Seen in play: "Unable to cancel matchmaking. A match has already been found." — the client sent `DELETE /candidate` and got 404.*
  - **What:**
    - `DELETE /candidate` should remove the player from the queue. It returned 404 once today.
    - Accept and track `POST /candidate/player/alive`, the game server's check on which expected players are still connected. It returned 404 3 times today.
  - **You'll notice:** cancelling a search really cancels. No more being pulled into the hunt 20 seconds later, and no hunt servers starting for nobody.
  - **Needs:** agree the design with 1.9. In live Dauntless, a matchmaking entry belonged to the party.
  - **Done when:** you queue, cancel within 20 seconds, and no hunt server starts.

- [ ] **1.11 Other players show up correctly** (S–M)
  - **What:**
    - `GET /account/api/public/account?accountId=…` looks up several players at once and returns a list.
    - `/account/api/public/account/:id` returns a display name.
    - Add `/account/mapping` and `/character/batch/account`.
  - **You'll notice:** a friend's nameplate shows their name, not yours, a blank or "Player". Inspect and Recent Players work. Recent Players are already stored in the character data.
  - **Needs:** 1.6. Overlaps 1.9.
  - **Done when:** two players in Ramsgate see each other's names and can inspect each other.

- [ ] **1.12 Each friend's saves land on their own account** (S to test, M if it needs a fix)
  - **What:**
    - Several routes work out which player a save belongs to from the login token the game server passes along. These are `POST /character`, breadcrumbs, encountered content and progression.
    - With two players on one server, each player's own token has to reach the server. If it doesn't, that player's saves fail: `controllers/character.ts:91` crashes when the player is missing.
    - Where the URL already names the player, use the URL instead.
  - **You'll notice:** this is what "my loot was saved" means once friends play together.
  - **Needs:** 1.4, and 1.9 (or two people queueing the same hunt).
  - **Done when:** two accounts play one hunt together. Both inventories get their loot, both characters' versions go up, and there are no 500 errors in the log.

- [ ] **1.13 Source link for friends (AGPL)** (S) — *The repository is public today (GitHub makes forks of public repositories public).*
  - **What:**
    - The fork is pushed to github.com/mixutin/dauntless-revived. Make sure friends can see it, either by making it public or by inviting them.
    - Tag the version you run (`friends-v1`).
    - Put the URL and the running commit in `/dauntless-status` and in a NOTICE file.
  - **Why:** friends use the modified server over the network, so they are owed its source. This is not legal advice.
  - **Done when:** `/dauntless-status` shows the source URL and the running commit.

- [ ] **1.14 Friend package v1** (M) — *Built 2026-09-21 in `friend-kit/`, packaged by `tools/make-friend-kit.ps1`:*
  - *`Setup.cmd` checks the zip, the exe and the DLL hashes and the VC++ runtime, installs the DLLs, checks that the host answers, registers once and stores the key without printing it.*
  - *`Play Dauntless.cmd` re-checks the hashes, points the game's chat (XMPP) at the host instead of Epic, and launches.*
  - *The zip carries `LICENSE`, `SOURCE.txt` (repository and exact commit), the MinHook notice and `SHA256SUMS`.*
  - *Tested against a mock server with 9 cases, including DLL replacement and "no key printed". It hasn't been tried by a real friend yet (needs 1.3–1.6).*
  - **What the zip contains:** `Play.cmd` and `Play.ps1`, the two DLLs, `SHA256SUMS`, `LICENSE`, the MinHook notice, `NOTICE` and a README. No game files.
  - **What `Play.ps1` does:**
    1. Asks for the friend's own 1.4.4 folder and checks the exe hash (`d3d41e61…cff4`).
    2. Checks the DLL hashes and the VC++ x64 runtime.
    3. Checks that Tailscale can reach `/dauntless-status`.
    4. The first time, registers the friend with a name and an invite code, and stores their key privately without ever printing it.
    5. Launches the game against `<100.x>:61000`.
  - The README should warn that antivirus may flag the DLL proxy.
  - **Why not the upstream launcher:** it is hard-wired to `api.stayundaunted.com` and a third-party game download. `docs/setup/friends.md` already describes the manual steps.
  - **Needs:** 1.4, 1.5, 1.6, 1.13.
  - **Your decision:** how friends get the 1.4.4 client is a copyright question.
  - **Done when:** a friend goes from the zip to Ramsgate without help.

- [ ] **1.15 First friends night** (S) — *Owner decision (2026-09-21): the first friends night runs on a **rented Windows Server with a public IP** (4.10) in **public mode** (1.17), not over Tailscale and not on the owner's PC.*
  - *Order: launcher (1.16) → public mode (1.17) with a permission audit → parties (1.9) → a rehearsal with two clients on the owner's PC through the public-mode path → the owner rents the server and enables key-only SSH (a one-time setup) → remote deployment and data migration → invites → friends night.*
  - **What:**
    - Log `stack.ps1 status` into a CSV every minute: memory and CPU per server, and free memory.
    - Afterwards, produce a report of errors, save conflicts, missing routes and killed servers.
    - Close WSL and other heavy programs while hosting.
  - **Watch out for:**
    - A hunt server shuts itself down after 50 seconds with nobody connected. A friend with a slow disk can arrive after it's gone (fixed in 4.6).
    - Don't close the black server console windows.
  - **Capacity:** one Ramsgate plus up to 6 hunts of 4 players. About 8–12 friends online is comfortable on this PC.
  - **Needs:** 1.1 through 1.14 (1.9 is optional), and 1.16 for the friends test.
  - **Done when:** two or more friends played a hunt together and the report shows no lost saves.

- [ ] **1.16 Friend launcher: a Windows app that installs everything and connects** (L) — *Owner request (2026-09-21): wanted for the friends test. Public source, no game files in it; the game files come from our own server.*
  - **Goal:** a friend installs one Windows app and presses **Register**, then **Download**, then **Launch**, and lands in Ramsgate with the graphics fix and everything else set up. The friend kit (1.14) stays as a fallback.
  - **Base:** fork upstream's `UndauntedLauncher/`, an Electron Windows app (AGPL) that already downloads the game, hash-checks it, extracts it and handles invite codes. It is hard-wired to Undaunted's CDN and `api.stayundaunted.com`. Replace those with our server, and add the parts below.
  - **What the launcher does:**
    1. **Join:** the friend pastes one invite string from the host: the server's Tailscale address plus an invite code. The launcher checks that Tailscale is installed and that the server answers (`/dauntless-status`), and explains how to fix it if not.
    2. **Register:** username (the 1.6 rules) plus the invite code. The account key is stored with Windows DPAPI (Electron `safeStorage`). It is never shown on screen or written to a plain file. An "export key" backup is offered once.
    3. **Download:** the 1.4.4 files come from our content server over Tailscale, file by file:
       - each file is checked against a **manifest of SHA-256 hashes that is compiled into the launcher's public source** (our verified 406/406 install), so even a compromised server can't push different files
       - interrupted downloads resume (HTTP Range)
       - several files download at once
       - **Repair** re-checks everything and fetches only broken files
    4. **Install:** the two DLLs (pinned hashes), the VC++ runtime check, and the user config: graphics preset (Cinematic by default, with a menu), chat (XMPP) pointed at the host instead of Epic, and the memory settings from `play.ps1`.
    5. **Launch:** starts `Dauntless-Win64-Shipping.exe` directly with the key passed as today. It shows whether the server is up.
    6. **Updates:** builds come from GitHub Actions using the public source and are published as GitHub Releases with SHA-256 sums. The launcher updates itself from there.
  - **Server side, the content server** (a small separate process such as `UndauntedContent/`, so big transfers never slow the game backend):
    - It serves only the files listed in the manifest, read-only, with no directory listing.
    - It serves **only to registered accounts**: every request carries the account's token, checked against the metagame. An invite code alone can register, not download.
    - It listens only on the Tailscale address, like everything else, so it can't be reached from the internet.
    - It limits downloads per account and logs each one (account, file, bytes).
    - **Game files never go into the repository, GitHub Releases or any public URL.**
  - **Things to know:**
    - An unsigned Windows app triggers SmartScreen ("Windows protected your PC" → More info → Run anyway). A code-signing certificate costs money; that's optional, for later.
    - Antivirus may flag the DLL proxy, as it can today.
    - Each friend's first download is about 10.9 GB, limited by the host's upload speed (about 30 minutes at 50 Mbit/s).
    - Sharing the files from our server is the same private-sharing choice as decision 9. It only replaces Google Drive.
  - **Needs:** 1.3 and 1.4 (Tailscale), 1.5 (invite codes), 1.6 (usernames for the register screen), 1.13 (source link, which the AGPL needs anyway).
  - **Done when:** a friend with only Tailscale and the launcher installer goes from nothing to Ramsgate through Register, Download and Launch. Also: the key never appears on screen or in a plain file; a deliberately corrupted game file is detected and repaired; and the content server refuses downloads without a valid account and can't be reached from outside Tailscale.

- [ ] **1.17 Public-IP mode: friends connect without Tailscale** (L) — *Owner request (2026-09-21): run the server on a public IP so friends need only the launcher and an invite. Tailscale stays as the "private mode".*
  - **Problem 1, no encryption:** the 1.4.4 client talks plain HTTP (the DLL builds `http://<address>/…`), so keys and login tokens would cross the internet readable.
    - **Fix:** a **local TLS relay inside the launcher**. The game talks to `http://127.0.0.1:61000` on the friend's own PC. The launcher forwards everything, including the chat WebSocket later, over **HTTPS** to the server.
    - **Certificate:** the server makes a self-signed one at install, and **its SHA-256 fingerprint travels in the invite link**. The relay only accepts that exact certificate, so no domain or CA is needed. With a domain, Let's Encrypt works too.
    - **The server-side QoS URL** points at `127.0.0.1:61000`, which is each friend's own relay.
  - **Problem 2, one front door:** a small gateway process is the only public TCP port (for example 443). Behind it, on 127.0.0.1: the metagame and the content server under `/content/`. The deploy server is never reachable.
    - **Blocked from outside:** admin routes, and any request carrying the game-server key header, so nobody outside can grant items.
    - **Limits:** request size limits, and rate limits on register and login.
  - **Problem 3, game ports:** UDP 8770–8777 must be public, and the game servers are 2020 Unreal netcode never built to face the internet.
    - **Fix: a dynamic allowlist.** A small privileged helper opens the game ports only for the public IP of a player who logged in over the gateway, and closes them when their heartbeats stop. Everyone else is dropped by the firewall.
  - **Invite v2:** `dauntless-revived://join?v=2&mode=public&host=<public IP or name>&port=<gateway port>&fp=<cert sha256>&code=…&name=…`. The launcher skips the Tailscale step in public mode.
  - **Deployment:** the Windows Server 2019 kit gets `-Mode Public`. It creates the certificate, installs the gateway and allowlist helper, adds firewall rules (TCP gateway port open; UDP game ports closed by default, with the allowlist opening them), and prints the fingerprint for invites.
  - **Needs:** 1.16 (launcher + content server), 4.10 (a host with a public IP, and port forwarding if it sits behind a router).
  - **Done when:** a friend with no Tailscale joins from another network through the launcher and plays a hunt. Also: a packet capture shows no key or token in clear text; a direct request to an admin route or with the game-server key from outside is refused; and a UDP probe from an address that hasn't logged in gets no answer.

### M2: Everything you earn is saved

Before starting M2, 0.1 must be running and 0.4 must be done.

- [ ] **2.1 Harden the saves that already work** (S) — *Built (fa1f71a): transactional character saves, 409/404 answers, guarded ProcessTriggers, lastModifiedDate. The version-race behaviour matches upstream: about 1 conflict per 5 saves, every one followed by a successful retry.*
  - **What:**
    - Check that the character update changed a row, and return 409 if it didn't (`controllers/character.ts:100-102` reports success either way).
    - Set `lastModifiedDate`.
    - Answer 404 instead of crashing when the character isn't the caller's.
    - Guard `ProcessTriggers` (`character.ts:48-60`). It crashes if one FTUE quest objective is missing, and then that character can't save at all.
    - A loadout save that matches no row must fail.
    - Breadcrumbs and encountered content: do the read and the write in one transaction.
    - Rewrite the old "client and server reject each other's writes" bug as: normal client retries, not data loss in the normal case, but not proven lossless.
  - **You'll notice:** nothing, unless something goes wrong. Then it fails loudly instead of silently.
  - **Done when:** a forced version race gets a 409, and a wrong character id gets a 404.

- [x] **2.2 Items can't be duplicated or overspent** (S) — ✅ *Built (fa1f71a): idempotent transactionIds and an append-only item log. Refusing overspends is available (`INVENTORY_REFUSE_OVERSPEND=1`) but off until a hunt-end body has been captured. **Also found and fixed in play (9589abb):** upstream never reported removed stacks after a transaction, so Rams and materials didn't drop on screen and a second upgrade went through for free. Verified fixed in the relog test.*
  - **What:**
    - Store each inventory `transactionId` with its result, and return that stored result when the same id arrives again.
    - Refuse to remove more than the player has. Today `controllers/inventory.ts:240-242` subtracts anyway and deletes the stack at 0.
    - Keep an append-only log of every item change.
  - **You'll notice:** over the internet, requests sometimes time out and get retried. Without this, a retried reward is granted twice and a retried craft costs twice.
  - **Done when:** sending the same transaction twice changes the inventory once, and removing 5 of an item you have 3 of is refused.

- [x] **2.3 Save history and safer storage** (S–M) — ✅ *Built: character and loadout history with an admin rollback route. WAL is opt-in (`DB_WAL=1`) until the backup docs cover the -wal file.*
  - **What:**
    - Switch the database to WAL mode.
    - Keep the last N versions of each character's data and loadout, alongside the item log from 2.2.
    - Add an admin command: "roll player X back to version N".
  - **Why:** each system is stored as one big value per character. One bad write replaces a whole inventory, and an unreadable inventory makes the character unloadable.
  - **Done when:** a test character can be rolled back one version from the admin tool.

- [ ] **2.4 Multiple loadouts** (M) — *Built (unlock, slotcount, active slot). *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* a real low-level account made **no** `unlock/3` calls at all, so the retry loop came from the fake level 50. The extra slots themselves are still to be tried in the UI.*
  - **What:**
    - Add routes: `POST /loadout/:uid/:cid/unlock/:n`, the account-level unlock, `slotcount` and `active/:index`.
    - Store the slot count and the active slot.
    - Allow saving any slot, not just slot 0 and "persistent".
    - Maximum 5 character slots.
  - **You'll notice:** more than one loadout. It also ends the server's retry loop: 43 failed `unlock/3` calls today, one after most character saves.
  - **Note:** with the fake level 50, every slot unlocks right away. Decide whether those slots stay unlocked after 2.13.
  - **Needs:** 0.4 (to confirm the unlock request), and a throwaway-account test.
  - **Done when:** `unlock/3` is answered once and not repeated, the loadout carousel shows the extra slots, and they are still there after logging in again.

- [ ] **2.5 Daily and weekly timers (cooldowns)** (S–M) — *Built. *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* `PUT /cooldown/batch` was stored and read back by the next server. Still to watch across a daily reset.*
  - **What:**
    - A cooldowns table.
    - `GET /cooldown/:uid` returns what is stored; `PUT /cooldown/batch/:uid` saves.
    - Add the "start" and "set" routes, which are missing today.
    - For game-server calls, identify the player from the URL.
  - **You'll notice:** daily limits (bounty tokens, patrol bonus chests, Trials rewards) currently reset whenever a new server loads you. After this they really are daily.
  - **Needs:** 0.4, for the cooldown names and format.
  - **Done when:** a new server sees the cooldowns the last one saved, and `TOKEN_DAILY_PATROL_BONUS` (×6 today) doesn't refill between hunts.

- [ ] **2.6 Bounties** (M) — *Built (storage + delete route; reward values still to design). *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* one bounty save stored. Drafting and claiming in the UI are still to try.*
  - **What:**
    - Store the bounty state the game server POSTs (it always sends the whole board) and return it on GET.
    - Add `POST /bounty/delete/:uid`, which claiming and abandoning a bounty both use (`dllmain.cpp:92`).
    - Fill `bounty_data` from the 226 bounty ids in the game files, with reward amounts we choose. The originals are lost.
  - **You'll notice:** bounties stay on your board across hunts and logins, and you can turn them in. Today even turning one in during the same session fails.
  - **Needs:** 0.4 and 2.5.
    - The XP a bounty pays only saves once 2.9 is done.
    - Group bounties need 1.9.
  - **Done when:** you draft a bounty, finish a hunt and log in again, and it is still there with its progress. Claiming it logs a 200 on `/bounty/delete`.

> **Steps 2.7–2.13: Slayer level, weapon and behemoth mastery, and Hunt Pass XP.** Do these in order and switch them on together. Upstream warned about endless mastery pop-ups, and any one of these steps alone can bring them back. None of these steps may hand out reward items: the game server already grants rank rewards through `/inventory`, so granting them here as well would double them.

- [x] **2.7 Progression storage and rank math** (S) — ✅ *Built with unit tests (fa1f71a).*
  - **What:**
    - Tables `progress_tracks`, `objectives` and `progression_events` (an audit log), all stored per account.
    - Rank math from `vendor/progression_config.json`, with unit tests. The tracks:
      - PlayerLevel: ranks 0–50, 1,111 XP in total
      - Behemoth: ranks 0–50, 411 XP in total
      - 7 weapon tracks: ranks 0–20, 115 XP each
      - season09b: 50 ranks of 100 XP each, plus prestige
  - **Done when:** the tests pass. For example, PlayerLevel progress 0 is rank 1, 1,111 is rank 50, and weapon progress 115 is rank 20.

- [x] **2.8 Read progression from the database** (S) — ✅ *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* the game server read real tracks (Slayer XP 0 → 8 over the session) and they survived the restart.*
  - **What:**
    - `GET /progression/:uid` returns every configured track as a plain list, with default rows for untouched tracks.
    - `GET /progression/objectives/:uid` returns a plain list. Upstream sends an object, which the game ignores.
    - A single objective returns zeros, not 9,999,999.
    - `phx_account_id` must always be the account in the URL (`routes/progression.ts:243` uses the token's id instead).
  - **Needs:** 2.7.
  - **Done when:** a throwaway account in "real" mode shows its stored level, not 50.

- [x] **2.9 Save XP from hunts** (M) — ✅ *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* grants add increments, objectives are stored and echoed, and nothing looped.*
  - **What:** `POST /progression/:uid`:
    - adds the track progress (probably added on top of what is stored; confirm with 0.4)
    - stores objectives exactly as sent
    - answers with the updated tracks and repeats every objective back
    - accepts calls from game servers only, and caps each grant
    - does everything in one transaction and writes the raw body to `progression_events`
  - **You'll notice:** Slayer level, weapon mastery and behemoth mastery go up and stay up.
  - **Needs:** 2.8 and 0.4.
  - **Done when:** after one hunt on the throwaway account, the tracks it touched went up and read the same after logging in again.

- [x] **2.10 Confirm rank-ups** (S) — ✅ *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* the game server confirms mastery and Slayer rank-ups automatically (rank 2, 3, 4; axe rank 1); each rank reward was granted once, through /inventory.*
  - **What:** `POST /progression/:uid/:track/:rank/confirm/{public|premium}` has no route today. It should:
    - raise the confirmed rank up to what the progress allows
    - apply premium only to accounts that own the entitlement
    - return the single updated track
  - **You'll notice:** each rank-up reward is claimed once, and the pop-ups don't repeat.
  - **Needs:** 2.9.
  - **Done when:** one rank-up produces exactly one confirm call and one reward transaction.

- [x] **2.11 XP granted by quests and the store** (S) — ✅ *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* `POST /progression/…/season09b/100` → 200, and the Hunt Pass moved to 100.*
  - **What:** add `POST /progression/:uid/:track/:amount`, plus an admin-only `DELETE` for resetting a track during tests.
  - **New today:** at 10:41:53 UTC the game server called `POST /progression/…/season09b/100` (`metagame.log` line 2870), right after an inventory transaction. It went to a 404. It was probably the Hunt Pass tutorial reward, since `TOKEN_HUNT_PASS_TUTORIAL` is now in the inventory.
  - **Needs:** 2.7.
  - **Done when:** that grant gets a 200 and season09b progress goes up by 100.

- [x] **2.12 Test the mastery pop on a throwaway account** (M) — ✅ **Passed.** *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* no endless mastery pop-up (crafting read the objective once), no repeated reward transactions, and everything survived the restart. Cause of upstream's pop-up: objectives were never stored or echoed (the client re-fetched them after every grant).*
  - **What:** set `PROGRESSION_MODE=real` for the second account only.
    1. Turn on 2.8 and 2.9, but leave confirm (2.10) off. Play one Dojo session or hunt.
    2. Look in the log for repeated `/confirm` 404s and for repeated identical `POST /inventory` calls.
    3. Turn confirm on and repeat. Whatever still repeats is the second cause.
  - **Needs:** 2.8 to 2.11, and a second account (a friend, or a second client on this PC if that works; untested).
  - **Done when:** a full hunt on the test account shows no repeated pop-ups and no repeated reward transactions, and the values are the same after logging in again.

- [ ] **2.13 Move existing players onto real progression** (S, plus your decision) — *Admin seed tool built (grandfather / fresh). Waiting for the owner's choice for their own account; new accounts start fresh.*
  - **What:** an admin seed command with two modes.
    - **Grandfather:** every track at its maximum and confirmed at max. It looks exactly like today and grants nothing.
    - **Fresh:** progress starts at 0.
  - **Recommendation:** grandfather the owner and start friends fresh.
    - Starting at level 1 re-locks things the fake 50 gives today: consumable slots (ranks 2, 4 and 7), loadout slots (ranks 34, 38 and 45), some crafting, and hunts gated on Slayer level.
    - Items the fake max has already handed out (alternate weapons and weapon unlock tokens from `PlayerDataRepair`) stay in the inventory.
  - **Needs:** 2.12, and a backup taken right before.
  - **Done when:** every account has a row for each track, and nobody's screen changed in a way you didn't choose.

- [x] **2.14 Entitlements** (S; the exact list format is unknown) — ✅ *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* `season09b_premium` (Elite) and two helper entitlements are there by default, and an entitlement the game server granted itself (`ent_daily_ssk01_plat`, the daily login pack) was stored and survived the restart.*
  - **What:**
    - An entitlements table.
    - `GET /entitlementsv2` lists them, `POST /entitlementv2/:uid` grants one (one grant was thrown away today at 09:50:31), and `DELETE` revokes one.
    - An admin grant, and a default set for new accounts.
    - Test the list format on the throwaway account first.
  - **Decisions:** give everyone `season09b_premium` (the Elite Hunt Pass)? Give everyone `ent_daily_ssk01_plat` (daily login rewards)?
  - **Needs:** 0.4.
  - **Done when:** an entitlement granted by the game server is still listed after logging in again.

- [x] **2.15 Hunt Pass** (M) — *Seen in play: the quest "The Hunt Pass — Claim your Hunt Pass rewards" can never complete, because the stub reports `season09b` with progress and both confirmed ranks at 99,999,999, so every reward already reads as claimed, and there is no confirm route to save a claim. Done when that quest completes by claiming a real reward, and the claim is still there after a relog.* — ✅ *Tester play test 2026-09-21 (real mode on a throwaway account, then a full restart and relog):* Claim confirmed rank 1 on **both** the free and Elite tracks, granted the rewards once (Seismic armour pieces), the tutorial quest "Claim your Hunt Pass rewards" completed, and everything was still claimed after the restart.*
  - **What:**
    - season09b starts at 0.
    - Grants from 2.9 and 2.11 move it forward.
    - Pressing Claim goes through 2.10.
    - Premium comes from 2.14.
    - Keep `/huntpass` and `huntpass_xp_config` consistent with season09b.
    - The client already applies the Elite 50% XP bonus, so don't apply it a second time.
  - **Decision:** stay on season09b, the only season with reward data, or rebuild the later season 1.4.4 shipped art for (probably 11b). The rebuild is XL research.
  - **Needs:** 2.10, 2.11, 2.14.
  - **Done when:** finishing a hunt moves the pass bar, Claim gives the rank reward exactly once, and both survive logging in again.

- [ ] **2.16 Escalation** (M)
  - **What:**
    - For each account and each of `ESC_SEASON_1`..`5`, store the level, the XP to the next level, talents, unlocks and a version number.
    - GET reads from the database, starting at level 1 instead of 99,999.
    - Add POST/PUT on the same path, with a version check.
    - Both lists must always be present in the response.
  - **You'll notice:** escalation levels and rewards build up and stay.
  - **Needs:** 2.9, and a captured escalation save (extend 0.4). Escalation hunts are only playable today because of a force-unlock in the client DLL; removing that needs 4.4.
  - **Done when:** an escalation run raises the level, and it is still there after logging in again.

- [ ] **2.17 Currency shown correctly** (S) — *Settled in play: `CURRENCY_NOTES` is the Rams (the menu showed exactly the database value).*
  - **What:**
    - `GET /balance` and `POST /reconcile` should work out balances from the inventory stacks (`CURRENCY_*`). Today they send fixed values: Notes from `users.notes` (0), and weapon tokens hard-coded to 25.
    - The client calls `/balance` (4 times today). Find which screen shows it.
    - Remove `users.notes`.
  - **You'll notice:** the Rams on screen match what you own. The inventory holds `CURRENCY_NOTES` ×1,260.
  - **Done when:** the screen that shows Rams matches `CURRENCY_NOTES` in the database.

- [ ] **2.18 Admin tools for one player's save** (M)
  - **What:** inspect a save; give or remove items (through the same inventory transaction); fix a quest step; reset a character; restore one player from a backup. None of it should need hand-editing SQLite while the server runs.
  - **You'll notice:** when a friend's save breaks, you can fix it in minutes.
  - **Needs:** 2.2, 2.3.
  - **Done when:** giving a test account an item, and restoring it from a backup, each take one command.

- [ ] **2.19 "Everything saves" check** (S)
  - **What:** two accounts play one hunt together, then:
    1. craft something
    2. change a loadout
    3. draft and claim a bounty
    4. log in again
    5. restart the metagame
    6. log in again
  - **Done when:** every row of the "What saves today" table that should say Yes now says Yes.

### M3: The full game loop

- [ ] **3.1 Check which features are switched on** (S per switch, M for all)
  - **What:** about 90 on/off switches are compiled into the client, and live servers could turn them on remotely. List their defaults, and test the ones you want through `UserGame.ini` on both the client and the game server.
  - **Do this first:** it decides whether some later M3 steps are worth building.
  - **Done when:** there is a list of switches with their defaults, and your choice for each.

- [ ] **3.2 Play-test the other hunt types** (S)
  - **What:** patrols, heroic pursuits and Heroic+ with two players; the story missions 11A Terramane and Sally/Terrogg.
  - **You'll notice:** the whole hunt ladder works, not just the tutorial.
  - **Needs:** 1.15, 2.5.
  - **Done when:** each has been played once, its rewards are in the database, the patrol bonus token goes down, and the story quest step moves forward.

- [ ] **3.3 Opening cores (loot containers)** (S to verify, M if it uses a separate call)
  - **What:** put a core in a test inventory and open it.
  - **You'll notice:** Hunt Pass, event and prestige cores pay out exactly once.
  - **Needs:** 2.2.
  - **Done when:** the core is removed and the rolled items are saved, once.

- [ ] **3.4 All cosmetics save** (S each)
  - **What:** check saving and reloading for titles, pets, curiosities, head and back accessories, dyes and sheens, and transmog. Check transmog first: unlocking it uses up transmog stones.
  - **Done when:** each one survives logging in again.

- [ ] **3.5 Mailbox and gifts** (M)
  - **What:**
    - Tables for messages and for who has read or redeemed them.
    - The routes `/all/`, `markAsRead`, `markAsDeleted` and `redeemParcel`. Redeeming a parcel grants its items through the inventory transaction.
    - An admin command to send a message.
  - **You'll notice:** welcome notes, and a way to gift items to a friend.
  - **Done when:** a gifted item is redeemed once and appears in the friend's inventory.

- [ ] **3.6 Welcome message (MOTD)** (M; the response format has to be researched first)
  - **What:** one message you can edit, plus `GET /motd/trigger` answering 204. Until this is done, put welcome text in the mailbox.
  - **Done when:** friends see your message at login.

- [ ] **3.7 Store** (L)
  - **What:**
    - An item catalogue served at `GET /product/skus/public` (400 today, 15 calls) and `GET /product/sku/:id`.
    - A purchase flow that takes the currency and grants the items in one inventory transaction.
    - The same service also runs the Trials store, the event stores, the Hunt Pass prestige store, the Middleman cell-dust exchange and loadout-slot purchases.
  - **Decision:** items free, or priced in in-game currency. If Platinum is used, hand it out through the mailbox.
  - **Needs:** 2.2, 2.14, 2.17.
  - **Done when:** buying one item takes the right currency once and adds the item once.

- [ ] **3.8 Trials** (rotation S–M, leaderboards M, schedule XL)
  - **What:**
    - (a) Everyone faces the same trial each week: cycle through the 67 cooked rows from a fixed start date instead of a random pick.
    - (b) Leaderboard tables and the 5 routes.
    - (c) Research making the client's expired schedule (it ends 2021-03-25) agree without the DLL force-unlock.
  - **Needs:** 1.9 (group leaderboards) and 4.4 (for c).
  - **Done when:** everyone sees the same trial for the week, and completion times show up on the board.

- [ ] **3.9 Seasonal events** (L, plus M for each event)
  - **What:**
    - An editable event schedule.
    - Then bring up one event at a time: Springtide, Dark Harvest, Frostfall (only a test hunt exists), Ramsgiving and Saint's Bond.
    - Each event needs event currency stacks, an event store and `/eventstats`.
  - **Needs:** 2.5, 3.7.
  - **Done when:** one event runs start to finish and its currency and rewards are saved.

- [ ] **3.10 Text chat** (M if the presence/XMPP server exists, L otherwise) — *Owner request (2026-09-21): wanted in-game. 1.4.4 typed chat runs on XMPP multi-user chat rooms (the client has "MUC State", "Known Chatrooms", `[OnlineSubsystemMcp.OnlineChatMcp]`). The game's XMPP connection already points at this PC (0.5, `ws://127.0.0.1:61099`), so one local XMPP server gives both chat and friends' online status. Options: write a small one, or run an existing open-source XMPP server with a plugin that accepts our login tokens (likely less code, and group chat comes built in). Still unknown: the room names the client joins (party, Ramsgate, whispers). Planned right after parties (1.9), so it can be ready for the first friends night; Discord covers voice and fills in until then.*
  - **What:** whispers, party chat, guild chat and the Ramsgate channel. Voice can't come back; use Discord.
  - **Needs:** the presence/XMPP work in 1.9.
  - **Done when:** two friends can whisper each other in game.

- [ ] **3.11 Guilds** (L)
  - **What:** guild, member and invite tables, and about 11 v2 routes (create, invite, join, leave, kick, ranks).
  - **Needs:** 1.9, 3.10.
  - **Done when:** a friend can be invited to a guild, and the guild survives a restart.

- [ ] **3.12 Rejoining a hunt after a crash** (M)
  - **What:** find how the client asks which hunt to rejoin (`/candidate/status` or the party state), and keep the hunt server alive long enough for the player to return.
  - **Needs:** 1.9, 4.6.
  - **Done when:** a friend whose game crashes mid-hunt gets back into the same fight.

- [ ] **3.13 Smaller systems as they show up** (M in total)
  - **What:** event stats, Linked Slayers, the player journey (`/pjm`), the leaderboard profile, and achievements. Achievements ride on objectives and become S once 2.9 is done.
  - Add each one when the log shows the game calling it.

- [ ] **3.14 Skyfishing** (M; only if 3.1 shows it is there)

**Not building:**
- Guild Gauntlet: it isn't in 1.4.4.
- Aether Casters: don't promise them. They have assets but no mastery track in our config.

### M4: Solid to run

- [ ] **4.1 Auto-restart and start at logon** (S)
  - **What:** `stack.ps1 supervise` restarts a crashed node process, waiting 5–60 seconds between tries and giving up after 5 crashes in 10 minutes. It runs from a hidden Task Scheduler task at logon. Also restart Ramsgate each night when nobody is online.
  - **Needs:** 1.1.
  - **Done when:** killing the metagame brings it back without you, and a reboot brings the stack back after logon.

- [ ] **4.2 Logs: rotation and less noise** (S)
  - **What:**
    - Start a new log file each day and keep 14 days.
    - The party poll is about 30% of all log lines today; log it only at debug level.
    - Add `stack.ps1 report`: errors, save conflicts, missing routes and killed servers.
  - **Done when:** a week of logs fits in a few MB and the report fits on one screen.

- [ ] **4.3 Memory and capacity guards** (M)
  - **What:**
    - Kill a hunt server over about 2.5 GB, or Ramsgate over about 3 GB, after two readings in a row.
    - Refuse to start a new server when free memory is under 3 GB or no port is free.
    - The metagame must stop sending a group to host "" port 0 when the start fails (`controllers/matchmaking.ts:81-91`); keep them searching instead.
  - **You'll notice:** a runaway server can't freeze the whole PC, and a busy night doesn't strand a group on a loading screen.
  - **Done when:** starting a 7th hunt shows the group waiting instead of hanging.

- [ ] **4.4 Build `UndauntedInternalServer.dll` from source** (M)
  - **What:** install VS 2022 Build Tools, then build Release|x64 with the static runtime (so friends don't need the VC++ runtime). Test on a separate binaries folder first: tutorial, Ramsgate, one hunt.
  - **Why:** every fix in 4.6 needs it, and the AGPL expects us to offer the source of what we hand out.
  - **Done when:** our own build passes that test and its hash is pinned.

- [ ] **4.5 Our own `dxgi.dll`** (S)
  - **What:** about 40 lines of C that load the system `dxgi.dll`, forward its 3 exports, and load our server DLL by its full path. The prebuilt proxy's source was never published.
  - **Needs:** 4.4.
  - **Done when:** the game starts with our proxy.

- [ ] **4.6 DLL fixes** (S each, after 4.4)
  - Logs go to files instead of console windows, so closing a window can no longer kill a server.
  - A configurable idle timeout: 180 seconds before the first player joins, 60 seconds after the last one leaves. Today a hunt quits after 50 seconds with nobody connected.
  - An explicit "persistent server" flag instead of treating any port ≥ 8776 as persistent. Until then, only add hunt ports below 8770.
  - The endpoint hook in server mode too, so servers stop reading the owner's `Game.ini`.
  - One endpoint URL is built without a slash (`GET /account127.0.0.1:61000`, 2 times today, from the client). Where it comes from hasn't been traced yet.
  - **Done when:** each fix is tested on the tutorial, Ramsgate and one hunt.

- [ ] **4.7 Friend package v2** (S)
  - **What:** ship our own DLLs (4.4, 4.5) with new pinned hashes.
  - **Done when:** a friend updates by unzipping over the old package.

- [ ] **4.8 Safe updates** (S)
  - **What:** `update.ps1`:
    1. Refuse to run if anyone is online.
    2. Back up the database and bundle the git repo.
    3. Show what changed upstream, flagging new migrations and DLL changes.
    4. Merge on a branch, then build both servers.
    5. Restart and run a smoke test: login, Ramsgate, one hunt, one save, one loadout change.
  - Pin Node at v24.19.0 while hosting; `better-sqlite3` is built for that version.
  - **Needs:** 0.1, 1.1.
  - **Done when:** an upstream update is applied with one command and the smoke test passes.

- [ ] **4.9 Capacity tuning** (S)
  - **What:** from the friends-night CSVs, decide whether to allow more hunts, adding ports downwards and at most about 8 on this PC.
  - **Done when:** there is a measured memory figure for a hunt server with 4 players fighting.

- [ ] **4.10 Always-on host** (L, optional)
  - **What:** a Windows mini-PC or VPS with at least 8 GB RAM, 4 cores and about 15 GB of disk; no GPU needed. Same Tailscale sharing setup, so friends only change one address. A cheaper Linux host depends on 4.11.
  - **Why Windows:** the metagame and deploy server are Node.js and run anywhere. The game servers (Ramsgate and each hunt) are the Windows 1.4.4 client exe switched into server mode by the injected DLL. There is no Linux server build.
  - **Moving:** copy the latest backup (database, `.env` signing keys, `gameserver.key`) to the new host and install the hash-checked 1.4.4 files. Accounts, keys and saves come along. The owner then joins like a friend, with the friend kit and the owner key.
  - **Needs:** 4.6 (endpoint hook) or a seeded `Game.ini`, plus 1.1 and 0.1. Size the machine from 4.9's measured 4-player figures.
  - **Done when:** friends can play while the owner's PC is off.

- [ ] **4.11 Experiment: game servers on Linux with Wine** (M for the first test; XL if Wine misbehaves) — *Owner request (2026-09-21): check whether a cheaper Linux host could work.*
  - **Why:** Linux VPSes are cheaper and have no Windows licence. Only the game servers are the problem; the Node services already run on Linux.
  - **Step 1, free, on this PC:** in WSL Ubuntu, install Wine (64-bit). Copy the hash-checked 1.4.4 files to the Linux filesystem, not `/mnt/c`, which is slow. Start one game server by hand with the deploy server's arguments on a spare port, against a test metagame (never the live one), with `WINEDLLOVERRIDES="dxgi=n,b"` so the game folder's proxy `dxgi.dll` loads.
    - Check that the DLL loads (its log output).
    - Check that the UDP port is bound.
    - Check for game-server calls (`gs=1`) and heartbeats in the test metagame's log.
    - Compare RAM and CPU with Windows (Ramsgate: about 1.1 GB and 0.2 of a core).
  - **Step 2:** a real client joins that server. From Windows into WSL2, UDP needs WSL's mirrored networking; otherwise use a small Linux VM or VPS on Tailscale. Load into Ramsgate and play one hunt.
  - **Step 3, if it works:** a deploy-server option to start game servers through `wine`, for example a `GAMESERVER_LAUNCHER` setting. Then a full session: tutorial, Ramsgate, a hunt with loot saved.
  - **Risks:** `UndauntedInternalServer.dll` hooks fixed addresses in the exe and overwrites engine globals. That doesn't depend on the OS, but it assumes Windows loader behaviour that Wine may not match. UE4 under Wine with `-nullrhi` is usually fine, but unproven for this build.
  - **Needs:** nothing for step 1. It never touches the live server.
  - **Done when:** a client plays Ramsgate and one hunt on a Wine-hosted game server with loot saved, using no more than about 20% more RAM and CPU than on Windows. Or we have a written reason it can't work, and 4.10 stays Windows.

---

## Decisions only you can make

1. **Owner's progression when it becomes real (2.13).** Keep today's max, or start over. Recommended: keep the max.
2. **Friends' progression.** ✅ **Decided: Option B.** Friends are invited after M2, so their first hunt already counts.
   - Option A: friends start at level 1 once M2 lands. The XP they earn before then is lost.
   - Option B: invite friends only after M2, so their first hunt counts.
3. **Elite Hunt Pass (`season09b_premium`) for everyone?** (2.14) ✅ **Decided: yes.** Grant it to every account, existing and new.
4. **Daily login pack (`ent_daily_ssk01_plat`) for everyone?** It turns on daily login rewards. (2.14)
5. **Hunt Pass season.** Stay on season09b, or research rebuilding 11b (XL). (2.15)
6. **Store.** Items free, or priced in in-game currency. (3.7)
7. **Our own reward values.** Bounty payouts, prices and other seasons' Hunt Pass rewards are lost. Anything we set is our design, not a restoration.
8. **Repository.** Public, or private with friends invited. (1.13)
9. **How friends get the 1.4.4 client.** (1.14) ✅ **Decided:** the owner shares the verified 1.4.4 build privately with friends through Google Drive (link shared only with them). *Update, 2026-09-21: the owner wants the friend launcher (1.16) to download the files from our own server instead, behind Tailscale and an account. Drive stays as a fallback.* The friend package checks the zip SHA-256 `556B9A648A5E5E7E11B6F8DD3D80FF8E88FCEB0D3448297AAF47CE7BF756BC6D` and the exe SHA-256 `D3D41E614908D2BEFD518B27046D9822D6130EF12BA3504BABBDB786BEF9CFF4` before anything runs.
10. **Unfinished content.** Enable the Frost escalation (Mint) and the Frostfall test hunt, or leave them off? They may be unfinished.
11. **Where the server lives.** Keep hosting on this PC, or move to an always-on machine. (4.10) The game servers need Windows unless the Wine experiment (4.11) works.

## Unknowns, and the experiment that settles each

| Unknown | Experiment | Step |
|---|---|---|
| Does the account survive a metagame restart? | Restart once while nobody plays, then log in with `owner.key`. | 0.3 |
| Exact formats of the XP grant, bounty, cooldown and entitlement saves; is track XP added on top or sent as a total? | Capture the request bodies during one session and one hunt. | 0.4 |
| Which cooldown ids exist, and why `TOKEN_DAILY_PATROL_BONUS` is ×6 | The same capture, then watch the token count across hunts after 2.5. | 0.4, 2.5 |
| Is each player's own login token passed to the game server when several players share it? | Two accounts in one hunt; check both inventories and character versions. | 1.12 |
| Does the client ever refresh its token? | A test account with a 5-minute token; watch for refresh calls or failed saves. | 1.8 |
| What the client does when the QoS address is unreachable | The first friend connection with and without step 1.4. | 1.4 |
| Does `windowsHide` hide the DLL's console window? | Start one server with it. | 1.1 |
| Who writes the endpoint block in `Game.ini`: the client or the servers? | Note its timestamp, then start a server with the client closed. | 1.1 |
| Does a rename show on other players' nameplates without logging in again? | Rename a test account while a second player watches. | 1.6 |
| Which of the two causes produced the endless mastery pop | **Settled 2026-09-21:** objectives that were never stored or echoed. With them stored, no pop-up loop. (Experiment was: Throwaway account: grant plus objectives with confirm off, then with confirm on.) | 2.12 |
| Are rank rewards granted by the game server through `/inventory`? | **Settled:** yes, the game server grants them (source `OnGrantOnlineProgressionAndObjectives`, and "Progression Track season09b Claim Rewards" for Hunt Pass claims). (Experiment was: Watch for the `OnGrantOnlineProgressionAndObjectives` transaction after a rank-up.) | 2.12 |
| Does the Hunt Pass wait for Claim, while mastery confirms automatically? | **Settled:** yes. Mastery and Slayer ranks confirm right after the grant; the Hunt Pass confirms only when Claim is pressed, free and premium separately. (Experiment was: Watch whether a Hunt Pass rank-up sends `/confirm` before Claim is pressed.) | 2.15 |
| Does a single-object response accept `code: null`? | The first confirm on the throwaway account. | 2.10 |
| Does the game server retry a failed inventory save? | Make `/inventory` fail once for the test account and watch the log. | 2.2 |
| Is the `unlock/3` loop caused by the fake level 50? | **Settled:** yes. A real low-level account made no unlock calls. (Experiment was: After 2.4, it should stop once answered. If not, check again with a fresh-level account.) | 2.4 |
| Do bounties, cooldowns and the mailbox read the reply's `payload` field or the top level? | Return a stored document to the throwaway account and check the UI. | 2.5, 2.6, 3.5 |
| The entitlement list format | The capture from 0.4, then a test grant on the throwaway account. | 2.14 |
| Which screen reads `/balance`; is `CURRENCY_NOTES` the Rams? | **Partly settled:** `CURRENCY_NOTES` is the Rams (the menu matched the database). (Experiment was: Return a distinctive number from `/balance` to the test account and look for it.) | 2.17 |
| Where cell dust is stored | Dust one spare cell on a test account and compare the inventory before and after. | 2.17, 3.7 |
| Does the game server or the backend compute escalation level and XP? | Capture the first escalation save. | 2.16 |
| Which features are switched on by default | Toggle them in `UserGame.ini` on a test setup. | 3.1 |
| The MOTD response format | Take apart the login-news handler near `0x140b47d50` in the exe. | 3.6 |
| Does the event schedule use the UI event id or the hunt-table event id? | Try both on a test setup. | 3.9 |
| Can the Trials schedule be overridden without the DLL hack? | Research `UTuningDataProvider.TableTuningJson`. | 3.8 |
| How the client rejoins a hunt after a crash | Kill a test client mid-hunt and watch the log. | 3.12 |
| Server memory with 4 players fighting; Ramsgate growth over long uptime | The friends-night CSV. | 1.15, 4.9 |
| Direct Tailscale path or relay, per friend | `tailscale ping` from each friend. | 1.3 |
| Was the prebuilt DLL built from the published source? | Rebuild it and compare. | 4.4 |
| Can the game servers run on Linux under Wine? | Start one game server in WSL with Wine against a test metagame, then connect a client. | 4.11 |
| Which season was live for 1.4.4 | Search archived configs and community data. | 2.15 |
| Can we recover if this PC's disk dies? | Restore the off-PC copy from 0.1 onto another machine and log in. (The server runs on the owner's own PC. Port 60000 is taken by the Shadow client app installed there, which is why we use 61000.) | 0.1 |

## Can't come back

- Voice chat — ran on Vivox, a paid third-party service. Use Discord.
- The real-money store — a private server can hand out the cosmetics instead.
- Content after November 2020 — 1.4.4 predates it. [Mystic Paradox](https://github.com/pranav158/Mystic-Paradox) is porting this approach to 1.12.0.
- Epic platform achievements. In-game achievement progress can come back with objectives (3.13).
- The original reward values: bounty payouts, other seasons' Hunt Pass reward tables and store prices. Whatever we set is our own design.
- Guild Gauntlet — it isn't in 1.4.4.
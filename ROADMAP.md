# Dauntless Revived — roadmap

Our fork of [Undaunted](https://github.com/SyST3MDeV/Undaunted) (AGPL-3.0), running the genuine
Dauntless 1.4.4 client. Branch `dauntless-revived`.

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

## Next, in order

- [ ] **Parties + friends list** — group up with friends on purpose; today parties are faked as "you, alone" and the friends list 404s ("0 ONLINE FRIENDS"). *Contract analysis in progress.*
- [ ] **Friends connected over Tailscale** — share this PC with each friend's Tailscale account, switch servers to the Tailscale address, invite codes on, firewall rules for the Tailscale interface only
- [ ] **Friend package** — launcher script, the two DLLs (hash-checked), AGPL licence + source link, setup steps
- [ ] **Choose your own username**
  - [ ] Pick it when registering (the friend package asks for it)
  - [ ] Validation: 3–16 characters, letters / numbers / underscore
  - [ ] Unique, case-insensitive (upstream lets two players share a name)
  - [ ] Rename later, including changing the owner account from the placeholder "Slayer"
  - [ ] Maybe: in-game rename, if the client offers it once `canUpdateDisplayName` is true (untested)
- [ ] **Progression that saves** — Slayer level and mastery are currently a fixed fake template (why everyone shows level 50); upstream rejects saves to dodge an "infinite mastery pop" bug
- [ ] **Bounties, Hunt Pass, cooldowns, escalation** — all stubbed, nothing carries over between sessions
- [ ] **Multiple loadouts** — and fix the server retrying `POST /loadout/.../unlock/3` forever (17 failures in one session)
- [ ] **Welcome message (MOTD) and mailbox**
- [ ] **Seasonal events** (Frostfall, Dark Harvest, …) — the event maps are in the game files; the schedule is stubbed
- [ ] **Store** — make cosmetics obtainable on a private server

## Bugs seen in real sessions

- [ ] Client and server both save the character and reject each other's writes (5 conflicts in one session)
- [ ] The server DLL builds one endpoint URL without a slash: `GET /account127.0.0.1:61000`
- [ ] Friends endpoints `GET /friends/api/public/{friends,blocklist}/{uid}` have no handler

## Infrastructure

- [ ] Per-server memory guard in the deploy server (upstream spawns game processes with no limit)
- [ ] Our own `dxgi.dll` proxy — the prebuilt one's source was never published, which matters under the AGPL
- [ ] Build `UndauntedInternalServer.dll` from source (needs VS 2022 Build Tools)
- [ ] Decide: publish the fork on GitHub? (public; AGPL requires the source to stay open for players anyway)

## Can't come back

- Voice chat — ran on Vivox, a paid third-party service. Use Discord.
- The real-money store — a private server can hand out the cosmetics instead.
- Content after November 2020 — 1.4.4 predates it. [Mystic Paradox](https://github.com/pranav158/Mystic-Paradox) is porting this approach to 1.12.0.

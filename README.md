<p align="right"><a href="README.fi.md">🇫🇮 Suomeksi</a></p>

<p align="center">
  <img src=".github/assets/banner.png" width="100%" alt="Dauntless Revived: private server revival of Dauntless 1.4.4. Play the genuine client on a server you host yourself. Fork of Undaunted, AGPL-3.0.">
</p>

<p align="center">
  <a href="LICENSE.txt"><img alt="License: AGPL-3.0-only" src="https://img.shields.io/badge/license-AGPL--3.0--only-3b82f6?style=flat-square"></a>
  <a href="https://mixutin.github.io/dauntless-revived/"><img alt="Documentation site" src="https://img.shields.io/badge/docs-mixutin.github.io-f59e0b?style=flat-square"></a>
  <a href="https://github.com/mixutin/dauntless-revived/discussions"><img alt="GitHub Discussions" src="https://img.shields.io/badge/discussions-ask%20%26%20share-8b5cf6?style=flat-square&logo=github"></a>
  <a href="https://github.com/mixutin/dauntless-revived/commits/dauntless-revived"><img alt="Last commit on the dauntless-revived branch" src="https://img.shields.io/github/last-commit/mixutin/dauntless-revived/dauntless-revived?style=flat-square"></a>
  <a href="https://github.com/mixutin/dauntless-revived/actions/workflows/ci.yml?query=branch%3Adauntless-revived"><img alt="CI status on the dauntless-revived branch" src="https://img.shields.io/github/actions/workflow/status/mixutin/dauntless-revived/ci.yml?branch=dauntless-revived&event=push&style=flat-square&label=CI"></a>
</p>

# Dauntless Revived

**Dauntless Revived is a private-server revival of Dauntless**, Phoenix Labs' free-to-play co-op
monster-hunting game. The official servers shut down on **30 May 2025**. This project lets you play
the genuine **Dauntless 1.4.4** client (October 2020, Unreal Engine 4) again, on a server you host
yourself. It is a modified fork of **[Undaunted](https://github.com/SyST3MDeV/Undaunted) by gwog
(Gregory Morford) and contributors**, who built the parts that make this possible: the DLL that
turns the retail client into a game server, the deploy server, the metagame backend and the
launcher. This fork adds fixes, a friend kit and documentation. No game files are distributed in
this repository or on the docs site: you need your own copy of the 1.4.4 client.

> **This is not a public server.** It is run for a few friends. Anyone can host their own copy from
> this repository.

## Quick answers

### Can you still play Dauntless?
Not on the official servers: Phoenix Labs shut them down on 30 May 2025. If you have a copy of the
1.4.4 client, you can play it on your own server with this project.

### Is there a Dauntless private server?
Yes, this is one: a self-hosted server for the 1.4.4 client, based on Undaunted. It is not open to
the public, so you run your own and invite your friends.

### Can I join your server?
No. There is no public server. The [setup guide](https://mixutin.github.io/dauntless-revived/setup/)
explains how to host one yourself.

### Does this project give out the game?
No. Neither this repository nor the docs site contains or links to game files. You need your own
copy of the client.

### Which version of the game does it work with?
Only **1.4.4**. The final client, 2.1.1, does not work, because Undaunted's server DLL hooks fixed
addresses inside the 1.4.4 executable.

### Do I need an Epic Games account?
No. Each player logs in with a personal account key issued by your own server.

### Is it official?
No. It is an unofficial, non-commercial fan project, not affiliated with Phoenix Labs or Epic Games.

More answers are in the [FAQ](https://mixutin.github.io/dauntless-revived/faq.html).

## Status

As of September 2026. Everything below was tested by one player on the host PC.

| Feature | State | Notes |
|---|---|---|
| Log in with a personal account key | Works | No Epic account needed |
| Tutorial | Works | Started on demand by the deploy server |
| Ramsgate (the hub city) | Works | A permanent Ramsgate server runs next to the backend |
| Training Dojo | Works | Starts the first time someone goes there |
| Hunts | Works (solo) | Played: a Lesser Boreus hunt and a pursuit |
| Crafting | Works | |
| Inventory, gear and quests | Works (solo) | Saved to SQLite; survives a client restart and a full server restart |
| Backups | Works on our host | Hourly, plus one around every server start and stop; restore tested. The scripts are not in this repository yet ([do-it-yourself version](https://mixutin.github.io/dauntless-revived/setup/admin.html#back-up-the-database)) |
| Friend kit | Built | Hash-checked setup and launcher; waits for Tailscale and invite codes |
| Slayer level, mastery and the Hunt Pass | Works (solo), on by default | Start from the beginning (Slayer level 1, no mastery, an empty Hunt Pass) and are saved; every account owns the Elite Hunt Pass. Tested in game on a throwaway account, including a full restart. `PROGRESSION_MODE=stub` brings back upstream's fixed level 50 ([upgrade notes](https://mixutin.github.io/dauntless-revived/setup/upgrading.html)) |
| Playing with friends over the internet | Not yet (M1) | Planned over Tailscale |
| Parties and the friends list | Not yet | |
| Bounties | Not yet | Stored with real progression; drafting and claiming not yet tried in game |
| Text chat | Not yet | Designed: a small local XMPP server |
| Multiple loadouts | Not yet | Slot unlocks stored with real progression; the extra slots not yet tried in game |

The live checklist, with every step and what "done" means for it, is [ROADMAP.md](ROADMAP.md).

## Quick links

| Link | What you'll find |
|---|---|
| [Documentation site](https://mixutin.github.io/dauntless-revived/) | Status, setup, findings and credits |
| [Setup guide](https://mixutin.github.io/dauntless-revived/setup/) | Hosting a server, joining as a friend, running it for a group, troubleshooting |
| [Friend kit](friend-kit/) | One-time setup and launcher for invited players ([guide](https://mixutin.github.io/dauntless-revived/setup/friends.html)) |
| [Roadmap](ROADMAP.md) | Milestones M0 to M4 and the live checklist |
| [FAQ](https://mixutin.github.io/dauntless-revived/faq.html) | Short answers to common questions |
| [Suomeksi](https://mixutin.github.io/dauntless-revived/fi/) | The documentation in Finnish |
| [Discussions](https://github.com/mixutin/dauntless-revived/discussions) | Questions, ideas and your own setups |

## How it works

1. Each player runs the unmodified 1.4.4 client with two DLLs from Undaunted next to it; they point the game's backend calls at your server.
2. The **metagame** (TypeScript, Express, SQLite; TCP 61000) handles accounts, characters, inventory, loadouts and matchmaking.
3. The **deploy server** (TCP 61001, this PC only) starts game servers on demand: more copies of the same client, switched into server mode by the DLL.
4. Those game servers (UDP 8770 to 8777) host Ramsgate, hunts and the Training Dojo; friends will reach them over Tailscale.

## Repository layout

| Folder | What it is |
|---|---|
| `UndauntedMetagame/` | The backend the game talks to: accounts, characters, inventory, loadouts, progression, matchmaking |
| `UndauntedDeployServer/` | Starts and supervises game-server processes (Ramsgate, hunts, the Training Dojo) |
| `UndauntedInternalServer/` | The DLL that lets the retail client run as a game server, and points clients at the backend |
| `UndauntedLauncher/` | The Dauntless Revived Launcher: the Windows app for invited friends, based on upstream's launcher |
| `friend-kit/` | Setup and launcher scripts for invited friends' PCs |
| `tools/` | `make-friend-kit.ps1` builds the friend kit zip; `sync-roadmap.js` copies the roadmap into the docs |
| `docs/` | The documentation site (GitHub Pages) |
| `ROADMAP.md` | The plan and live checklist |

## Changes from upstream

- The metagame and deploy server listen on this machine only unless told otherwise (`BIND_HOST`).
  Upstream listened on every network interface, and the deploy server has no authentication.
- Failing to bind a port is now a hard error. Upstream reported success anyway and exited silently.
- Every request the metagame receives is logged, marking calls made by game servers.
- The Training Dojo starts the first time someone goes there instead of at boot (`ENABLE_DOJO=1`
  restores the old behaviour).
- Tokens are removed from the request log. An optional capture of request bodies for the save
  routes that are not finished yet (`LOG_BODIES=1`) records what the game sends, capped at 8 KB per
  request and with tokens removed.
- **Real progression by default.** Upstream answered progression with a fixed template (every
  account at level 50, a Hunt Pass with nothing to claim, and most likely the Elite track locked) and saved
  nothing. Our metagame stores Slayer level, mastery, the Hunt Pass, entitlements (the Elite pass
  for everyone), loadout slots, cooldowns and bounties per account. `PROGRESSION_MODE=stub` restores
  upstream's behaviour. Updating a server that already has players? Read the
  [upgrade notes](https://mixutin.github.io/dauntless-revived/setup/upgrading.html) first.
- A **friend kit** (`friend-kit/`, packaged by `tools/make-friend-kit.ps1`): a one-time setup and a
  launcher for invited players. It checks the two Undaunted DLLs against pinned SHA-256 hashes,
  registers the player, points the game's chat connection at the host so it never contacts Epic's
  old chat server, and ships with the license, third-party notices and a `SOURCE.txt` naming the
  exact commit.
- A **documentation site** in `docs/`, published at
  [mixutin.github.io/dauntless-revived](https://mixutin.github.io/dauntless-revived/): setup
  guides, findings about the game's backend, and the roadmap.

Not in the repository yet: our host runs hourly SQLite backups, each checked with
`PRAGMA integrity_check` (roadmap item 0.1), but those scripts are not part of this repository.
The metagame itself takes no backup, so if you self-host, set one up yourself:
[Run it for a group](https://mixutin.github.io/dauntless-revived/setup/admin.html#back-up-the-database)
has a do-it-yourself version.

## Security

- The metagame and the deploy server bind to `127.0.0.1` by default.
- The deploy server has **no authentication by design**. Never expose it beyond the host PC.
- Friends are meant to connect over Tailscale, not over the open internet.

Found a vulnerability? Please report it privately through
[private vulnerability reporting](https://github.com/mixutin/dauntless-revived/security/advisories/new),
not in a public issue. [SECURITY.md](SECURITY.md) has the details and the scope.

## Contributing

Ideas and fixes are welcome. Please open a [Discussion](https://github.com/mixutin/dauntless-revived/discussions)
before you start on anything big, test on a throwaway account, and never commit keys, `.env` files
or game files. [CONTRIBUTING.md](CONTRIBUTING.md) has the short version of the rules, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) covers how we treat each other.

## Related projects

- **[Undaunted](https://github.com/SyST3MDeV/Undaunted)**: the upstream project this fork is based on.
- **[Mystic Paradox](https://github.com/pranav158/Mystic-Paradox)**: ports the same approach to the
  Dauntless 1.12.0 client, for content released after 1.4.4. We have not tested it, and this fork
  contains none of its code.

## Credits

- **[Undaunted](https://github.com/SyST3MDeV/Undaunted)** by gwog (Gregory Morford) and
  [its contributors](https://github.com/SyST3MDeV/Undaunted/graphs/contributors): the server-mode
  DLL, the deploy server, the metagame and the launcher. Multiplayer Ramsgate and hunts on 1.4.4
  are their achievement.
- **[MinHook](https://github.com/TsudaKageyu/minhook)** by Tsuda Kageyu (BSD 2-Clause): the
  function-hooking library in the server DLL.
- **[Dumper-7](https://github.com/Encryqed/Dumper-7)** by Encryqed and contributors: the Unreal
  Engine SDK generator the server DLL is built against.
- **Phoenix Labs**, who made Dauntless.

### Contributors

- **[Vvoidddd](https://github.com/Vvoidddd)**: the fix for the dark pre-hunt airship (1.4.4's
  automatic exposure), hidden console windows for hunt servers, and the repository's `.gitignore`
  ([#5](https://github.com/mixutin/dauntless-revived/pull/5)).

Everyone who has contributed is listed on the
[contributors page](https://github.com/mixutin/dauntless-revived/graphs/contributors).

The full list is on the docs site's
[Credits and license](https://mixutin.github.io/dauntless-revived/legal.html) page.

## License

This is a **modified version of [Undaunted](https://github.com/SyST3MDeV/Undaunted)** by gwog
(Gregory Morford) and contributors. Modifications began on **21 September 2026**; every change is
recorded in this repository's commit history, and planned work is in [ROADMAP.md](ROADMAP.md).

GNU Affero General Public License v3.0 only — see [LICENSE.txt](LICENSE.txt). If you run a modified
version for other people, you must offer them its source code.

Not affiliated with or endorsed by Phoenix Labs or Epic Games. "Dauntless" is a trademark of its owners.
No game files are distributed in this repository or on the docs site.

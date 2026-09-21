# Dauntless Revived

A private server for **Dauntless**, the monster-hunting action RPG whose official servers shut down on
30 May 2025 — kept alive for playing with friends.

This is a **modified version of [Undaunted](https://github.com/SyST3MDeV/Undaunted)** by gwog (Gregory
Morford) and contributors. Modifications began on **21 September 2026**; every change is recorded in this
repository's commit history, and planned work is in [ROADMAP.md](ROADMAP.md).

It works with the genuine Dauntless **1.4.4** client. No game files are included — you need your own copy.

## Components

| Folder | What it is |
|---|---|
| `UndauntedMetagame/` | The backend the game talks to: accounts, characters, inventory, loadouts, progression, matchmaking |
| `UndauntedDeployServer/` | Starts and supervises game-server processes (Ramsgate, hunts, the Training Dojo) |
| `UndauntedInternalServer/` | The DLL that lets the retail client run as a game server, and points clients at the backend |
| `UndauntedLauncher/` | Upstream's desktop launcher |

## Changes from upstream so far

- The metagame and deploy server listen on this machine only unless told otherwise (`BIND_HOST`).
  Upstream listened on every network interface, and the deploy server has no authentication.
- Failing to bind a port is now a hard error. Upstream reported success anyway and exited silently.
- Every request the metagame receives is logged, marking calls made by game servers.
- The Training Dojo starts the first time someone goes there instead of at boot (`ENABLE_DOJO=1`
  restores the old behaviour).

## License

GNU Affero General Public License v3.0 only — see [LICENSE.txt](LICENSE.txt). If you run a modified
version for other people, you must offer them its source code.

Not affiliated with or endorsed by Phoenix Labs or Epic Games. "Dauntless" is a trademark of its owners.

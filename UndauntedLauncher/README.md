# Dauntless Revived Launcher

*[Suomeksi](README.fi.md)*

The Windows app friends install to play on a Dauntless Revived server. It joins a server from an
invite, creates the account, downloads and checks the Dauntless 1.4.4 game files from the host's
own server, sets everything up and starts the game. English and Finnish.

**No game files are in this app or in this repository.** They come from the host's content server,
and every file is checked against the list of 410 files, sizes and SHA-256 hashes compiled into the
launcher (`UndauntedContent/data/dauntless-1.4.4.json`). A server that offers anything else is refused.

## For friends

1. Install `DauntlessRevivedLauncher-Setup.exe` from the project's releases. It is not code-signed
   yet, so SmartScreen may ask you to confirm (More info, then Run anyway).
2. Open the invite link your host sent you, or paste it on the Play page and press **JOIN**.
3. Pick a username and press **REGISTER**. Save a backup of your key when the launcher offers it.
4. Press **INSTALL** (about 11 GB). You can pause, close the launcher and continue later.
5. Press **PLAY**.

## Two kinds of server

| | Private (invite v1) | Public (invite v2) |
|---|---|---|
| Where | the host's PC | a server with a public IP |
| How friends connect | Tailscale | directly, over TLS to the server's gateway |
| Invite | `dauntless-revived://join?v=1&host=…&port=61000&code=…&name=…[&share=…]` | `dauntless-revived://join?v=2&mode=public&host=…&port=443&fp=…&code=…&name=…` |

In public mode the invite carries `fp`, the SHA-256 of the server's TLS certificate. Every connection
(status, registration, downloads and the game itself) is checked against it before anything is sent.
A server with a different certificate gets nothing, and the launcher says "this is not your friend's
server".

The account key for a public server is tied to that fingerprint. An invite for the same address with
a different certificate never gets the key: the launcher shows both fingerprints and asks first, and
the key moves to the new certificate only if you confirm (do that only when your host tells you they
set the server up again). Private (v1) invites work only with Tailscale addresses (100.64.0.0/10) and
`*.ts.net` names, because that connection is plain HTTP inside the tailnet.

The 1.4.4 game only speaks plain HTTP, so in public mode the launcher runs a **local relay** while the
game runs: the game talks to `http://127.0.0.1:61000` on your own PC, and the relay carries every
request (and the chat WebSocket) over pinned TLS to the server. Keep the launcher open while you play;
it asks before closing while the game runs. The relay listens on 127.0.0.1 only and refuses requests
that come from a web page.

## Security

- The page is sandboxed with context isolation and no Node access. It cannot reach the network at
  all; the main process makes every request, only to the invite's host. The page talks to the main
  process through a small typed API (`src/preload.ts`), and every argument is checked again.
- Strict Content-Security-Policy. Images come only from the app itself or from the host's art pack,
  fetched by the main process over the pinned connection and served through an internal scheme.
- Navigation and new windows are blocked. Links open in the browser only from a fixed allow-list.
- The account key is stored only with Windows DPAPI (`safeStorage`). It is never shown, never written
  to a plain file except the backup you choose to save, and masked in the log.
- The key goes only to the invite's host (in public mode only over the pinned connection): with the
  account check, the downloads and the server status. The server shows who is online to registered
  players only, so before you register the server panel says to sign in instead of listing anyone.
  Launchers released before that change send no key and do not know that answer: against a server
  that has it they show 0 players online and no worlds until they update themselves. Update a server
  from an older version only after the launcher release with the change is out.
- Electron fuses: no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`, no inspector flags, app code only
  from the integrity-checked asar.
- The two DLLs the game needs ship with the launcher and are checked against pinned hashes before
  they are copied and before every launch, like `friend-kit/play.ps1`.

## Development

Requirements: Windows, Node.js 24.

```powershell
npm ci
npm run typecheck
npm test            # unit tests (node:test), local test servers on ports 624xx only
npm run make        # installer and zip in out/make/
```

`npm test -- relay` runs only the test files whose name contains "relay". The tests cover invite
parsing, the relay (pinned certificate, wrong certificate, headers, bodies, streaming, keep-alive,
WebSocket), downloads (resume, verify, repair) over plain HTTP and pinned TLS, Engine.ini, launch
arguments and the whole public-mode flow through the controller. They make throwaway self-signed
certificates in a temp folder.

`DAUNTLESS_REVIVED_RELAY_PORT` moves the relay off 61000 for rehearsals on a PC where 61000 is
taken. The server must then point `QOS_TARGET_URL` at the same port.

`npm run icon` redraws `assets/icon.png` and `assets/icon.ico` (the launcher's own emblem).

## Releases and updates

CI (`.github/workflows/ci.yml`) builds and tests the launcher on every push and keeps the installer,
the zip and `SHA256SUMS.txt` as a download for a week. `.github/workflows/launcher-release.yml`
publishes the version in `package.json` from `dauntless-revived` as the GitHub release
`launcher-v<version>`, with a build provenance attestation for every file, and creates that tag. So to
release, raise the version:

- by default, a push to `dauntless-revived` that passes every check and has a version with no
  `launcher-v<version>` release yet publishes the installer CI built. Set the repository variable
  `LAUNCHER_AUTO_RELEASE` to `false` (Settings > Secrets and variables > Actions > Variables) to pause
  that;
- or run Actions > **Launcher release** > **Run workflow** on `dauntless-revived`.

After publishing, the release workflow points the rolling `launcher-updates` release at the new
version; installed launchers check it every hour to update themselves. A version is published only if
it is newer than every earlier one, and never replaced. A prerelease version (such as `0.2.0-beta.1`)
becomes a GitHub prerelease and never reaches `launcher-updates`. If a run fails halfway, re-run its
failed jobs: it finishes what it started. Running the workflow for a version that is published already
only brings `launcher-updates` up to it. Keep GitHub's immutable releases setting off, because
`launcher-updates` is updated in place.

## License

AGPL-3.0-only. Based on the Undaunted launcher by gwog (Gregory Morford) and contributors. An
unofficial fan project, not affiliated with or endorsed by Phoenix Labs or Epic Games.

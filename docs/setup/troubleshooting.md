---
title: Troubleshooting
parent: Setup
nav_order: 4
description: "Problems we hit running the Dauntless 1.4.4 client against an Undaunted server, with causes and fixes: port clashes, login, blurry graphics, Defender and git."
lang: en
ref: setup/troubleshooting
---

{% assign host_page = site.pages | where: "path", "setup/host.md" | first %}
{% assign roadmap_page = site.pages | where: "path", "roadmap.md" | first %}
{% assign crashes_page = site.pages | where: "path", "findings/crashes.md" | first %}
{% assign awakening_page = site.pages | where: "path", "findings/awakening-2-1-1.md" | first %}

# Troubleshooting
{: .no_toc }

These are the problems we actually hit while setting up Dauntless Revived, with their causes and fixes.
A few entries at the end come from reading the code and haven't bitten us yet; those are marked. The
setup itself is in [Host a server]({{ host_page.url | relative_url }}). Unless an entry says otherwise, it is about client build
**1.4.4**. Entries about **2.1.1** are kept because the same machine often has both builds.

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Where to look first

| Source | What it tells you |
|---|---|
| `C:\dr\data\metagame.log` | One JSON line per event. The fork logs every request as `METHOD /path gs=0` (client) or `gs=1` (game server). This is the main instrument: how far did the client get, and what did it ask for last? |
| `C:\dr\data\deploy.log` | Matchmaking requests, `Running Gameserver Watchdog!` every 60 s, `Cleaning up Gameserver on port N` when a server exits. |
| Game-server console windows | One per server, opened by the server DLL. They show the server's own output. |
| Client console window | Opened by the DLL in client mode. **If no console window appears when the client starts, the DLLs are not loaded.** |
| `%LOCALAPPDATA%\Archon\Saved\Crashes\` | Crash reports. See [Crash forensics]({{ crashes_page.url | relative_url }}) for reading them. |

The 1.4.4 shipping client writes no game log file of its own. `Saved\Logs` only holds the embedded
browser's logs. To read the metagame log as plain text:

```powershell
Get-Content C:\dr\data\metagame.log -Tail 40 | ForEach-Object { try { ($_ | ConvertFrom-Json).msg } catch { $_ } }
```

---

## Port 60000 is taken, and the metagame says "Clear Skies" anyway {#port-60000-is-taken-and-the-metagame-says-clear-skies-anyway}

**Symptom.** The metagame printed `Undaunted Metagame on port 60000` and `Clear Skies, Slayer.`, but
nothing worked. The client and our own HTTP calls to `127.0.0.1:60000` connected and then waited
forever. The request log stayed empty.

**Cause.** Two problems together:

1. `127.0.0.1:60000` belonged to **`ShadowUSB`**, a service installed with the Shadow client app (the
   cloud-gaming client, installed on our own PC). It accepts TCP connections on that port and never
   answers HTTP.
2. Upstream's `app.listen(PORT, () => { ... })` ignores the error that Express 5 passes to the listen
   callback. The failed bind still printed the success lines, and then the process exited.

**Fix.**

- Find out who owns a port before you use it:

  ```powershell
  Get-NetTCPConnection -LocalPort 60000,61000,61001 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { "{0}:{1} {2}" -f $_.LocalAddress, $_.LocalPort, (Get-Process -Id $_.OwningProcess).ProcessName }
  ```

- We moved to **61000** (metagame) and **61001** (deploy server). Change `PORT`, `QOS_TARGET_URL` and
  `DEPLOYSERVER_URL` in the metagame `.env` and `PORT` in the deploy server's `.env`. Then
  **regenerate** `Game.ini` with `make-gameini.ps1 -Metagame 127.0.0.1:61000`
  ([Host a server, step 8]({{ host_page.url | relative_url }}#game-ini)).
- Our fork's metagame and deploy server now treat a failed bind as fatal and exit with code 1:

  ```
  Could not listen on 127.0.0.1:60000: listen EADDRINUSE: address already in use 127.0.0.1:60000
  ```

**Follow-up we also hit.** After the move, two entries in `Game.ini` were still on port 60000. Our
search-and-replace matched `:60000/`, and `MatchmakingEndpoint` and `TrackingEndpoint` are bare
`http://host:port` values with no path, so matchmaking and telemetry would have stayed on the old
port. A search for leftover `60000` strings caught them. Regenerating the file instead of editing it
avoids this.

---

## Invoke-RestMethod hangs {#invoke-restmethod-hangs}

**Symptom.** In Windows PowerShell 5.1,
`Invoke-RestMethod -Method Post -Uri http://127.0.0.1:60000/undaunted/api/Register ...` never
returned, and the metagame logged nothing.

**What it actually was.** At first we put it down to a PowerShell 5.1 quirk and switched to Node.
The real cause was the previous entry: the port belonged to `ShadowUSB`, which accepted the connection
and never replied. `curl.exe -m 5` made that obvious: it connected immediately, got no HTTP response
in 5 seconds (`http=000`), and a check of the listening process showed `ShadowUSB`.

**Fix and habit.**

- Check who owns the port (previous entry) before blaming the client.
- Put a time limit on every scripted HTTP call so a wrong listener fails fast:

  ```powershell
  curl.exe -s -m 5 http://127.0.0.1:61000/dauntless-status
  Invoke-RestMethod -Uri http://127.0.0.1:61000/dauntless-status -TimeoutSec 10
  node -e "fetch('http://127.0.0.1:61000/dauntless-status', { signal: AbortSignal.timeout(5000) }).then(r => r.text()).then(console.log)"
  ```

We still make admin calls with Node `fetch` and `AbortSignal.timeout`, because the same one-liner can
also update the database through `better-sqlite3` (see
[Host a server, step 10]({{ host_page.url | relative_url }}#admin-account)).

---

## git: "Filename too long" and "'$GIT_DIR' too big" {#git-filename-too-long}

**Symptom.** Cloning Undaunted into a deeply nested working folder printed
`error: unable to create file ...: Filename too long`, even for files like
`.git/hooks/fsmonitor-watchman.sample`. It then ended with:

```
fatal: '$GIT_DIR' too big
fatal: remote helper 'https' aborted session
```

**Cause.** The Windows 260-character path limit. The working folder's path was already long, and the
repository adds up to 94 more characters. The deepest names are in
`UndauntedInternalServer/SDK/`, a generated SDK of 4,000+ files. Git's own files under `.git` add more
still. Adding `-c core.longpaths=true` did **not** fix it: the `$GIT_DIR` error comes from the
repository location itself being too long.

**Fix.** Clone to a short path and keep `core.longpaths` set for the files inside:

```powershell
git -c core.longpaths=true clone <URL of this repository> C:\dr\undaunted
git -C C:\dr\undaunted config core.longpaths true
```

We didn't enable Windows' system-wide long-path setting. The short path made it unnecessary. The
same reasoning applies to the game install (`C:\D144`) and to building the server DLL with MSVC later.

---

## Blurry graphics {#blurry-graphics}

**Symptom.** 1.4.4 looked soft and low-detail whatever we chose in the options menu, and ran in a
small window.

**Cause.** Our own memory caps. After the 2.1.1 memory scare (next entry), we had written these into
the shared user `Engine.ini`, and we launched with `-windowed -ResX=1280 -ResY=720`:

```ini
[SystemSettings]
r.Streaming.PoolSize=400
r.Streaming.LimitPoolSizeToVRAM=1
r.Streaming.FullyLoadUsedTextures=0
r.MipMapLODBias=2
r.ScreenPercentage=70
sg.ViewDistanceQuality=0
sg.ShadowQuality=0
sg.PostProcessQuality=0
sg.TextureQuality=0
sg.EffectsQuality=0
sg.FoliageQuality=0
t.MaxFPS=60
gc.TimeBetweenPurgingPendingKillObjects=10
s.ForceGCAfterLevelStreamedOut=1
```

`[SystemSettings]` in the user `Engine.ini` overrides the menu. So the options screen showed one
thing while the engine rendered at 70 % resolution with blurred texture mips. On top of that, UE4's
temporal anti-aliasing softens the image a little at any setting.

**Fix.** `play.ps1` now rewrites `[SystemSettings]` on every launch
([Host a server, steps 13-14]({{ host_page.url | relative_url }}#graphics)):

- `-Graphics 4` (Cinematic) by default.
- `r.ScreenPercentage=100`, `r.MipMapLODBias=0`, `r.MaxAnisotropy=16`, `r.Tonemapper.Sharpen=0.6`.
- A texture pool of 3000 MB, limited to the GPU's memory.
- The same level mirrored into `GameUserSettings.ini`.
- No FPS cap and no forced window.

`-Graphics -1` keeps only the memory lines and lets the menu decide. At Cinematic and 1920x1080, the
client uses 1.9-2.3 GB of RAM, so the low caps were never needed for 1.4.4.

### Airship is extremely dark with blown-out windows

**Symptom.** The hunt UI looks normal, but the pre-hunt airship cabin is nearly black while its
windows are solid white. It can vary between hunts because the lobby previews the hunt atmosphere.

**Cause.** Dauntless 1.4.4's histogram eye adaptation can react badly to the airship's unusually
large brightness range on current graphics drivers. This is a post-processing problem, not missing
textures or an incorrect hunt definition.

**Status.** The previous `r.EyeAdaptationQuality=0` workaround fixed the airship but made Ramsgate
and night maps too dark. The launcher and `tools/play-local.ps1` now remove that global override on
the next launch. Automatic exposure remains on. An opt-in Basic adaptive metering experiment is in
[upstream PR #7](https://github.com/mixutin/dauntless-revived/pull/7); it still needs an in-game
comparison of the airship, Ramsgate and a night hunt before it can be called a fix.

To see what is really being forced:

```powershell
Get-Content "$env:LOCALAPPDATA\Archon\Saved\Config\WindowsClient\Engine.ini" -TotalCount 20
```

---

## A command window opens for every hunt

The deploy server starts each hunt as a separate, temporary game-server process. Those hunt
processes now start with their console windows hidden. Ramsgate and the Training Dojo remain visible
so the host can still inspect their long-running server logs. Restart the deploy server after updating
for this behavior to take effect.

---

## Memory spikes and caps {#memory-spikes-and-caps}

**What happened (2.1.1).** A standalone 2.1.1 client booting straight into Ramsgate, with no limits,
climbed to **9 GB**. Together with everything else running, that took our 32 GB PC to 98 %
(31.3 of 31.9 GB). With a 400 MB texture pool, low scalability groups and the two garbage-collection
lines, the same boot peaked at about **2.8 GB**. We also added a watchdog that killed the process
above 6.5 GB. Details: [The 2.1.1 standalone attempt]({{ awakening_page.url | relative_url }}).

**1.4.4 is much lighter** (our measurements, one player):

- Ramsgate server: about 1.1 GB.
- Hunt server: about 0.9 GB.
- Client at Cinematic: 1.9-2.3 GB.

So the setup keeps only the caps that don't cost image quality: a 3000 MB pool limited to VRAM, plus
`gc.TimeBetweenPurgingPendingKillObjects=10` and `s.ForceGCAfterLevelStreamedOut=1`.

**What we use now.**

- `play.ps1 -Seconds 180 -CapMB 12000` watches the client for 3 minutes. It prints its RAM every 30 s
  and kills it if it goes over the cap.
- Our manual server test script does the same for a game server (default cap 5000 MB).
- Before a session, close heavy programs. If you use WSL, `wsl --shutdown` frees what its VM holds
  (about 3 GB on our PC). You can also cap it permanently in `%UserProfile%\.wslconfig`:

  ```ini
  [wsl2]
  memory=4GB
  ```

**Known gap.** Upstream's deploy server starts game processes with no memory limit, and six
simultaneous hunts are possible with the default port range. A per-server memory guard is on the
[roadmap]({{ roadmap_page.url | relative_url }}). Until then, watch the servers with:

```powershell
Get-CimInstance Win32_Process -Filter "Name='Dauntless-Win64-Shipping.exe'" | ForEach-Object { "{0,6}  server={1}  {2} MB" -f $_.ProcessId, ($_.CommandLine -match ' -server'), [int]($_.WorkingSetSize/1MB) }
```

---

## Stale EOS overlay processes (2.1.1 only) {#stale-eos-overlay-processes}

**Symptom (2.1.1).** After a crashed run, the Epic sign-in overlay didn't come up on the next launch.

**Cause.** `EOSOverlayRenderer-Win64-Shipping` processes left over from the crashed run.

**Fix.** Kill only those processes before relaunching. Leave the Epic Games Launcher alone.

```powershell
Get-Process EOSOverlayRenderer-Win64-Shipping -ErrorAction SilentlyContinue | Stop-Process
```

This doesn't apply to the 1.4.4 setup on this site. 1.4.4 predates Epic Online Services, has no EOS
overlay, and logs in with a key issued by our own metagame.

---

## Windows Defender and the unsigned DLLs {#windows-defender-and-the-unsigned-dlls}

**Background.** `dxgi.dll` and `UndauntedInternalServer.dll` are unsigned. A proxy DLL that hooks a
game is the kind of thing heuristic antivirus flags. On our PC, Defender reported **no detections**
after we copied them in. We checked with:

```powershell
Get-MpThreatDetection -ErrorAction SilentlyContinue | Where-Object { $_.InitialDetectionTime -gt (Get-Date).AddHours(-1) } |
  Select-Object InitialDetectionTime, @{n='Resources';e={$_.Resources -join ';'}}
```

**If Defender flags or removes one of them:**

- Don't turn Defender off, and don't exclude whole folders.
- Compare the file you have with the pinned hashes in
  [Host a server, step 5]({{ host_page.url | relative_url }}#dlls). If it doesn't
  match, delete it and copy it again from a fresh clone.
- If the hash matches, the detection is heuristic, on bytes we have analysed. Our static analysis of
  both files is summarised in step 5. Whether to restore that one file from **Windows Security →
  Protection history** is your decision.
- We cloned with git, so we never hit this, but downloading the repository as a zip marks the files
  as coming from the internet. After checking the hashes, `Unblock-File` on the two DLLs clears that
  mark.

The lasting fix is to build `UndauntedInternalServer.dll` from source and replace `dxgi.dll` with our
own small proxy. The source of `dxgi.dll` is not in the Undaunted repository and, as far as we know,
has not been published. Both are on the [roadmap]({{ roadmap_page.url | relative_url }}).

---

## npm allow-scripts warnings {#npm-allow-scripts-warnings}

**Symptom.** `npm ci` (npm 11.17 on Node 24.19) in both server folders ended with:

```
npm warn allow-scripts   esbuild@0.18.20 (postinstall: node install.js)
npm warn allow-scripts   better-sqlite3@12.11.1 (install: prebuild-install || node-gyp rebuild --release)
npm warn allow-scripts   esbuild@0.25.12 (postinstall: node install.js)
npm warn allow-scripts   esbuild@0.28.1 (postinstall: node install.js)
npm warn allow-scripts
npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.
```

**What it meant for us.** Nothing broke:

- `npm run build` (plain `tsc`) succeeded.
- The one native module the servers need was present.
- `esbuild` is only used by development tools (`tsx`, `drizzle-kit`), and `npm start` doesn't run
  those.

Check the native module:

```powershell
Test-Path C:\dr\undaunted\UndauntedMetagame\node_modules\better-sqlite3\build\Release\better_sqlite3.node
```

**If that prints `False`,** the metagame can't open its database. Review and approve only that
package, as npm suggests, then reinstall:

```powershell
npm approve-scripts better-sqlite3
npm ci --no-audit --no-fund
```

Its install script downloads a prebuilt binary (`prebuild-install`) or, failing that, compiles one
(`node-gyp`, which needs the Visual Studio C++ build tools). We haven't needed this step ourselves.
The native module is tied to the Node version, so run `npm ci` again after any Node upgrade.

---

## Endpoint values cut to "https:" (the ini `//` truncation) {#ini-truncation}

**Symptom (seen on 2.1.1).** All 163 values in an `[OnlineSubsystemPhoenix]` block in the user
`Engine.ini` read just `https:`, for example `AccountInfoEndpoint=https:`. Everything from the `//` on
was gone.

**Cause.** The engine's ini parser treats `//` inside an **unquoted** value as the start of a comment
and cuts the value there. The game writes its config back to disk, so the cut values replaced the
originals. That block happened to be harmless: `[OnlineSubsystemPhoenix]` belongs to the `Game.ini`
hierarchy, so in `Engine.ini` it was never read, and the live 2.1.1 traffic still reached the full
URLs. As an override in `Game.ini`, it would have broken every endpoint.

**Fix.**

- **Quote every URL** you put in a user ini, the way Phoenix's cooked config does:
  `AuthEndpoint="http://127.0.0.1:61000/game/login"`.
- Put endpoint overrides in `Game.ini`, never `Engine.ini`. Delete any `[OnlineSubsystemPhoenix]`
  block you find in `Engine.ini`.
- Generate `Game.ini` with `make-gameini.ps1`
  ([Host a server, step 8]({{ host_page.url | relative_url }}#game-ini)) and
  run its health check. It should report `entries: 167  not fully quoted: 0`.

On 1.4.4, our quoted `Game.ini` has been rewritten by the game after many sessions and every value is
intact. We have not tested unquoted values on 1.4.4.

---

## A game server vanished when a window was closed {#server-console-windows}

Every game server opens a console window, because the server DLL's console logging is on by default.
**Closing a console window ends that server** for everyone on it. The deploy server's watchdog
restarts Ramsgate (and the Dojo) within about a minute. A hunt server is not restarted. Leave the
windows open (minimise them). Writing server output to log files instead is on the
[roadmap]({{ roadmap_page.url | relative_url }}).

A message box reading **"INVALID GAMESERVER ARGS"** means a game server was started with fewer than
eight arguments after the exe name. Compare your command with the manual server command in
[Host a server, step 11]({{ host_page.url | relative_url }}#deploy-server).

---

## Log lines that look alarming but are known {#log-lines-that-look-alarming-but-are-known}

From our own metagame log (1.4.4, one player, one evening of tutorial, Ramsgate and the Dojo):

| Line | Seen | What it is |
|---|---|---|
| `Unstubbed route POST /loadout/<account>/<character>/unlock/3` | 40+ | Upstream has no handler for unlocking a loadout slot. The game server (`gs=1`) sends it in bursts of retries, several within a few seconds, then again minutes later. Harmless; on the roadmap. |
| `Failed to update characterId ... due to conflict` | 14x | The client and the game server both save the character, with version numbers, and reject each other's writes. Each time, the side whose write was rejected (sometimes the client, sometimes the game server) re-read the character and wrote again within about a second, so the last write reached the database. Not yet proven lossless when both change the same value at once; on the roadmap. |
| `Unstubbed route GET /friends/api/public/friends/<account>` and `.../blocklist/<account>` | 2x each | No friends list yet; the game shows "0 ONLINE FRIENDS". |
| `Unstubbed route GET /account127.0.0.1:61000` | 2x | One URL that the client assembles from the DLL's address override is missing a `/`. The metagame answers 404; nothing visible breaks. |
| `Unstubbed route POST /candidate/player/alive`, `DELETE /candidate` | a few | Matchmaking-queue housekeeping without handlers. |
| `Unauthenticated POST to /heartbeat which needs Undaunted Metagame auth!` | once | An early telemetry heartbeat sent during login, before the session is set up. Later heartbeats are authenticated. |
| `Running Gameserver Watchdog!` (deploy log) | every 60 s | Normal. |
| `Cleaning up Gameserver on port 8775` (deploy log) | when a hunt ends | The hunt server exited and its port went back to the pool. |

---

## Login doesn't get past the title screen

Read the metagame log from the moment you launched:

- **No `POST /account/api/oauth/token` at all.** The client isn't reaching the metagame. Check that:
  - a client console window appeared (if not, the DLLs are missing from `Win64` or aren't loading);
  - the first launch argument is `127.0.0.1:61000`;
  - the metagame is listening (`curl.exe -s -m 5 http://127.0.0.1:61000/dauntless-status`).
- **`Invalid API key auth!`** The key passed as `-AUTH_PASSWORD` doesn't match any account. Check
  `C:\dr\data\owner.key` and make sure you are using the right database file (`DB_FILENAME`). The
  server stores only a hash of each key, so a lost key can't be recovered; a key re-issue tool is on
  the roadmap.
- **Login works, but nothing loads after matchmaking.** Look for `gs=1` lines. If there are none, the
  game server isn't reaching the metagame:
  - `Game.ini` is missing or wrong (run the step 8 health check), or
  - the game-server key wasn't registered (the metagame must have logged
    `Registered 1 new Gameserver API Key(s) on boot!` once), or
  - `METAGAME_API_KEY` in the deploy server's `.env` differs from `gameserver.key`.

---

## Switching between 2.1.1 and 1.4.4

Both builds use `%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient`. Settings left over from one build
apply to the other. Examples are a `GameDefaultMap` override from 2.1.1 experiments, or 1.4.4's
endpoint overrides in `Game.ini`. We keep the inactive build's folder renamed (`WindowsClient.211`)
and swap before switching; see [Host a server, step 6]({{ host_page.url | relative_url }}#config-folder).
Never copy the 1.4.4 DLLs into a 2.1.1 install: their addresses are for the 1.4.4 exe only.

---

## Not hit yet, but known from the code

These come from reading the code (plus, for the first one, a small test), not from something that
went wrong for us.

- **A leftover hand-started game server.** Servers the deploy server starts end together with it:
  it uses Node's default (not detached) `spawn`, and on Windows Node puts such children in a job
  object that closes when Node exits. We confirmed that with a test process, not with a game server.
  A server started by hand (the manual command in step 11, or our test script) is outside that job
  and keeps running. A deploy server started afterwards immediately launches a new Ramsgate on UDP
  8777, which the old one still holds. Before starting the deploy server, stop any process whose
  command line contains `-server` (checklist step 2 in
  [Host a server]({{ host_page.url | relative_url }}#checklist)).
- **A hunt server that quits before a slow player arrives.** Below port 8776, the server DLL exits
  once the server has had nobody connected for a total of 50 seconds. A player whose map load takes
  longer could arrive to find it gone. A configurable idle timeout is on the
  [roadmap]({{ roadmap_page.url | relative_url }}).
- **Saves failing in very long sessions.** Login tokens expire after 24 hours. Game-server saves
  carry the player's token, and the metagame's check has no error handling for an expired one, so
  after 24 hours those saves fail with a server error. Until this is fixed, quit the game at least
  once a day. Whether the client ever refreshes its token is still untested.
- **Running out of hunt ports.** With the default range, six hunts can run at once. A seventh
  request fails inside the deploy server (`No free ports left!`, an HTTP 500 to the metagame), and
  upstream's metagame logs `DeployServer returned status 500` and then hands the group an empty host
  and port 0 instead of an error. This is on the roadmap together with the memory guard.

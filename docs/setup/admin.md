---
title: Run it for a group
parent: Setup
nav_order: 3
description: "Opening a Dauntless Revived server to a few friends: Tailscale sharing, firewall rules, invite codes, admin accounts, capacity figures and database backups."
lang: en
ref: setup/admin
---

{% assign friends_page = site.pages | where: "path", "setup/friends.md" | first %}
{% assign roadmap_page = site.pages | where: "path", "roadmap.md" | first %}
{% assign legal_page = site.pages | where: "path", "legal.md" | first %}

# Run it for a group
{: .no_toc }

This page covers how we open our Undaunted-based stack (client build **1.4.4**) to a handful of
friends: network access, firewall, addresses, accounts, capacity and backups. It assumes the stack
already runs for you locally, with the metagame, the deploy server and a Ramsgate server.

**Status.** As of this writing our stack runs on loopback for the owner only. The steps below are the
configuration we are switching to (the "Friends connected over Tailscale" item on the
[roadmap]({{ roadmap_page.url | relative_url }})). Anything planned but not built yet is marked as
such. The other side of this setup is [Join as a friend]({{ friends_page.url | relative_url }}).

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What runs on the host

| Component | Listens on | Who has to reach it |
|:----------|:-----------|:--------------------|
| Metagame (`UndauntedMetagame`: Node, Express, SQLite) | TCP 61000 | Every player's client, every game server, and you as admin |
| Deploy server (`UndauntedDeployServer`) | TCP 61001, loopback only | Only the metagame on the same PC. **It has no authentication.** |
| Ramsgate server | UDP 8777 (`PORT_RANGE_END`) | Players. Always running, and restarted by the deploy server's watchdog if it dies. |
| Training Dojo | UDP 8776 | Players. Our fork starts it on first use; `ENABLE_DOJO=1` restores upstream's always-on behaviour. |
| Hunt servers | UDP 8770-8775 | Players. One per group of up to 4. Each exits after 50 seconds in total with nobody connected. |

The game servers are further instances of the same 1.4.4 client executable. The deploy server starts
them with `-server -nullrhi`, the two DLLs load into each one, and they need no GPU. Upstream's
launcher expects a local metagame on port 60000, but on our host another program already held 60000,
so we use 61000 and 61001.

## Why Tailscale instead of port forwarding

Port forwarding would put all of the following on the public internet:

- **Everything is plain HTTP.** The client DLL rewrites every backend endpoint to
  `http://<metagame address>/...`. There is no TLS anywhere in the stack.
- **Account keys travel in the clear.** At login, the game posts the player's key as the
  `exchange_code` to `/account/api/oauth/token`. The launcher and admin API send it in the
  `x-undaunted-user-api-key` header. What comes back is a 24-hour RS256 bearer token that gives full
  access to that player's data.
- `POST /undaunted/api/Register` needs no authentication, and nothing in the metagame limits request
  rates.
- The deploy server has no authentication at all. Anyone who reaches TCP 61001 can make your PC start
  game processes.
- The game servers are a 2020 game build with an injected DLL, not hardened network services.

Tailscale avoids all of that. Each friend's traffic to the host is encrypted with WireGuard, and only
people you have shared the machine with can reach it. You need no router changes and no public IP, so
it also works behind carrier-grade NAT. Removing a share cuts a friend off at once. The costs: every
friend installs Tailscale, and some connections go through a Tailscale DERP relay instead of a direct
path. Relays work, with higher latency.

## Share the host PC with Tailscale

1. Install Tailscale on the host and sign in. `tailscale ip -4` prints the host's `100.x.y.z` address.
   The address stays the same as long as the machine stays in your tailnet. Friends' scripts and
   `MY_IP` both depend on it.
2. In the Tailscale admin console, open the host machine's menu, choose **Share**, and invite each
   friend by email or link. Each friend accepts with their own Tailscale account. Do not add friends as
   users of your tailnet. A share exposes this one machine and nothing else.
3. Set Tailscale to start with Windows and to run unattended, so the address exists before the stack
   starts (see [Switch the addresses](#switch-the-addresses-to-tailscale)).
4. Optional: tailnet policy rules can limit what share recipients may reach on this machine to
   `tcp:61000` and `udp:8770-8777`. We have not settled the exact policy syntax for shared users
   (unverified). Check Tailscale's access-control documentation. The Windows firewall rules below are
   the enforcement we rely on.
5. Ask each friend to run `tailscale ping <host address>` once. A reply `via DERP(...)` means they are
   relayed rather than direct.

Removing a friend's share is currently the only complete way to lock someone out. See
[Missing admin functions](#missing-admin-functions-and-workarounds).

## Firewall: allow only the Tailscale interface

Windows Defender Firewall blocks inbound traffic by default. On our host there were no inbound rules
for the game or for Node at all. Add exactly two allow rules, each tied to one program, the Tailscale
interface and Tailscale's address range. Run these in an elevated PowerShell:

```powershell
$game = "C:\D144\Dauntless\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe"
$node = "C:\Program Files\nodejs\node.exe"

New-NetFirewallRule -DisplayName "Dauntless Revived - metagame (Tailscale)" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 61000 `
  -Program $node -InterfaceAlias Tailscale -RemoteAddress 100.64.0.0/10

New-NetFirewallRule -DisplayName "Dauntless Revived - game servers (Tailscale)" `
  -Direction Inbound -Action Allow -Protocol UDP -LocalPort 8770-8777 `
  -Program $game -InterfaceAlias Tailscale -RemoteAddress 100.64.0.0/10
```

- **Never open TCP 61001.** The deploy server has no authentication.
- Check that the adapter is really called `Tailscale` with `Get-NetAdapter`.
- If you have ever answered Windows' "allow access" prompt for `node.exe` or the game, Windows created
  its own rules for that program. An allow rule from that prompt opens the program on every interface
  of that network type. A block rule overrides the allow rules above. List them and remove the ones you
  do not want:

  ```powershell
  Get-NetFirewallApplicationFilter -Program $node, $game | Get-NetFirewallRule |
    Format-Table DisplayName, Direction, Action, Enabled, Profile
  ```

- Check which network category Windows gave the Tailscale adapter with
  `Get-NetConnectionProfile -InterfaceAlias Tailscale`. If it is `Private`, any rules you allow for
  private networks (file sharing, for example) also apply to share recipients. Setting it to `Public`
  avoids that. We have not checked whether Tailscale resets the category on reconnect (unverified).
- Test from a friend's PC with
  `Invoke-RestMethod http://<host address>:61000/undaunted/api/RegistrationStatus`. The same request
  from another device on your home LAN should fail.

## Switch the addresses to Tailscale

Three settings point at `127.0.0.1` today and have to change:

| Setting | File | New value | Why |
|:--------|:-----|:----------|:----|
| `MY_IP` | `UndauntedDeployServer/.env` | `<host 100.x address>` | The only host address the deploy server hands out for Ramsgate, the Dojo and hunts, via the matchmaking result. With `127.0.0.1`, a friend's client would travel to its own PC. |
| `QOS_TARGET_URL` | `UndauntedMetagame/.env` | `http://<host 100.x address>:61000/QoS` | `/candidate/regions` returns this URL as the region to ping. With `127.0.0.1`, friends ping their own localhost. We have not tested what the client does when that ping fails. |
| `BIND_HOST` | `UndauntedMetagame/.env` | `<host 100.x address>` | The address the metagame listens on. Our fork defaults to `127.0.0.1`; upstream listened on every interface. |
| `BIND_HOST` | `UndauntedDeployServer/.env` | stays `127.0.0.1` | No authentication. |
| `DEPLOYSERVER_URL` | `UndauntedMetagame/.env` | stays `127.0.0.1:61001` | The metagame reaches the deploy server locally. |

**The catch: the metagame listens on one address**, and two local things talk to it as well.

1. **Your own client.** Launch it against the Tailscale address. Our host launcher takes it as
   `play.ps1 -Backend "<host 100.x address>:61000"` (the friends' script calls the same parameter
   `-Server`). The traffic stays on your PC.
2. **The game servers.** The DLL rewrites endpoints only in client mode. It never hooks the config in
   server mode. Game-server processes instead read the endpoint overrides from the host account's user
   config, `%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient\Game.ini`, section
   `[OnlineSubsystemPhoenix]`. On our host that section has 167 entries of the form
   `AuthEndpoint="http://127.0.0.1:61000/game/login"`. They must point at an address the metagame
   listens on. Back the file up, then rewrite it:

   ```powershell
   $ts = "100.x.y.z"      # the host's Tailscale address
   $gi = "$env:LOCALAPPDATA\Archon\Saved\Config\WindowsClient\Game.ini"
   Copy-Item $gi "$gi.bak"
   (Get-Content $gi) -replace '127\.0\.0\.1:61000', "${ts}:61000" | Set-Content $gi -Encoding ASCII
   ```

   We have not pinned down which process writes that section. Its timestamp matched both the client
   travelling and a server starting (unverified). After your first session, check that it still points
   where you expect. A server that cannot reach the metagame cannot load or save characters.

Because of this, **Tailscale must be connected before the metagame starts.** If the address does not
exist yet, our fork exits with `Could not listen on <address>:61000`. Upstream announced success anyway
and then quit silently.

Do not use `BIND_HOST=0.0.0.0` to sidestep this. The metagame would then listen on your LAN as well,
and only the firewall would stand between LAN devices and an unauthenticated registration endpoint.

Planned in the fork:

- Let `BIND_HOST` take a list (`127.0.0.1,<100.x>`), so local traffic stays on loopback and the
  `Game.ini` rewrite is no longer needed.
- Hook the config in server mode too, so game servers stop depending on the owner's `Game.ini`.

### Restarting after a change

Both services read `.env` only at start (`npm run start`, which runs
`node --env-file=.env dist/server.js`).

1. Stop the deploy server first. Otherwise its watchdog starts a new Ramsgate.
2. Check for leftover game servers. Normally they end together with the deploy server: it starts them
   with Node's default (not detached) `spawn`, and on Windows Node places such children in a job
   object that is closed when the parent exits. We confirmed this with a test process, both for a
   normal exit and for a forced kill. Servers started by hand, for example with our test script, are
   not covered and keep their UDP ports. The first argument on a game server's command line is the
   gameserver key, so do not print their command lines. Your own client runs the same executable
   without `-server`, and this filter leaves it alone:

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name = 'Dauntless-Win64-Shipping.exe'" |
     Where-Object { $_.CommandLine -match '\s-server(\s|$)' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```

3. Stop the metagame.
4. Start the metagame from its own folder, because its migrations path is relative to the working
   directory. Then start the deploy server, which launches Ramsgate right away.

A metagame restart does not log players out, because tokens are stateless 24-hour JWTs. It does lose
in-memory state: matchmaking queues and the list of who is online.

## Accounts: authentication, registration and invite codes

Two `.env` settings in the metagame decide who can get in:

- `AUTH_MODE=APIKEY` with `NODE_ENV=production`. The other mode, `AUTH_MODE=NONE`, takes whatever the
  client sends as the user id, so anyone can log in as anyone. It is honoured only outside production.
  Never use it with friends.
- `REGISTRATION_MODE`:

| Mode | `POST /undaunted/api/Register` |
|:-----|:-------------------------------|
| `NONE` | Always refused (400). |
| `INVITECODE` | Needs a valid code. A wrong or used-up code gets 401. |
| `OPEN` | Anyone who can reach the metagame gets an account. |

Set `INVITECODE` in `.env` **before** the metagame listens on Tailscale. Ours is still `OPEN`, which is
harmless only while it listens on loopback. The admin API can switch the mode at runtime, but only in
memory: a restart goes back to the `.env` value.

Registration returns the new player's key (`UUK_` followed by 48 hex characters) once. The server keeps
only its SHA-256 hash.

### Making invite codes

Admin calls are authenticated with an admin account's own key in the `x-undaunted-user-api-key`
header. In our layout the owner's key lives in `C:\dr\data\owner.key`. This block creates a random
single-use code, lists all codes, and revokes one:

```powershell
$M = "100.x.y.z:61000"    # wherever the metagame listens
$h = @{ "x-undaunted-user-api-key" = (Get-Content C:\dr\data\owner.key -Raw).Trim() }

# new single-use code from a cryptographic random source
$b = New-Object byte[] 6
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$code = ([BitConverter]::ToString($b) -replace '-', '').ToLower()
Invoke-RestMethod -Method Post -Uri "http://$M/undaunted/api/RegisterInviteCode" -Headers $h `
  -ContentType "application/json" `
  -Body (@{ NewInviteCode = $code; Uses = 1; InfiniteUses = $false } | ConvertTo-Json)
$code        # send this to one friend, privately

# list, and revoke
(Invoke-RestMethod -Uri "http://$M/undaunted/api/InviteCodes" -Headers $h).InviteCodes
Invoke-RestMethod -Method Delete -Uri "http://$M/undaunted/api/InviteCode/$code" -Headers $h
```

- Codes are used up atomically: a single SQL `UPDATE` checks and decrements the remaining uses, so two
  people cannot both redeem a single-use code.
- A code is used up the moment it validates, before the account row is written. If writing the
  account then fails, the code is gone anyway. Our planned username checks will run before the code is
  used up.
- Prefer single-use codes, one per friend, sent privately. Use `InfiniteUses` only briefly, if at all.

### Making an account an admin

An admin is a row in the `users` table with `isAdmin = 1`. No API sets it. Edit the database while the
metagame is stopped, for example with a small `better-sqlite3` script run from the `UndauntedMetagame`
folder (`UPDATE users SET isAdmin = 1 WHERE userId = ?`). An admin key is simply that user's account
key, so keep it on the host.

## The admin API (as it exists upstream)

All routes live under `/undaunted/api` on the metagame port. "Admin" means the
`x-undaunted-user-api-key` header must belong to a user with `isAdmin`. A missing or unknown key gets
401; a valid key that is not an admin gets 403.

| Method and path | Auth | What it does |
|:----------------|:-----|:-------------|
| `GET /RegistrationStatus` | none | `{ "RegistrationMode": ... }` |
| `POST /RegistrationStatus` | admin | Body `{ "RegistrationStatus": <mode> }`, where the mode is `NONE`, `INVITECODE` or `OPEN`. In memory only. |
| `GET /InviteCodes` | admin | All codes with their remaining uses. |
| `POST /RegisterInviteCode` | admin | Body `{ "NewInviteCode", "Uses", "InfiniteUses" }`. |
| `DELETE /InviteCode/:code` | admin | Revoke a code. |
| `GET /GetAllUsers` | admin | `{ "Users": [{ "Username", "UserId" }] }` |
| `POST /GenerateJWTForUserId` | admin | Body `{ "UserId" }`, returns `{ "JWT" }`. Mints a 24-hour game token **for any user**, which amounts to playing as them. Treat admin keys accordingly. |
| `GET /PrivateOnlineStats` | admin | Per player: map, hunt and hunt start time, for players seen in the last 90 seconds. |
| `POST /Register` | none (mode-gated) | Body `{ "Username", "InviteCode" }`. Returns `{ "UUK" }`. |
| `GET /GetUserInfo` | user key | `{ "UserId", "Username", "IsAdmin" }` |
| `GET /PublicOnlineStats` | user key | `{ "NumActivePlayers" }` |

Upstream's Electron launcher has an admin screen for the registration mode and invite codes, but it is
hard-wired to upstream's own public server. We call the API directly instead.

### Missing admin functions and workarounds

Upstream has no API to rename, delete or ban a user, to revoke or reissue a key, or to promote an
admin.

- **Locking someone out.** Remove their Tailscale share, which cuts network access at once. Then
  delete their row from `userapikeys`. Their key stops working at the next login, but a token that was
  already issued stays valid for up to 24 hours.
- **A friend lost their key.** It cannot be recovered, because only its hash is stored. Issue a new one
  by replacing the hash. A re-key admin endpoint is planned. Until then, save this as `rekey.js` in the
  `UndauntedMetagame` folder, so that `require` finds `better-sqlite3`:

  ```js
  // node rekey.js <UserId>   (take the UserId from GET /undaunted/api/GetAllUsers)
  const crypto = require("crypto");
  const fs = require("fs");
  const Database = require("better-sqlite3");
  const db = new Database("C:/dr/data/undaunted.db", { fileMustExist: true });
  const userId = process.argv[2];
  const key = "UUK_" + crypto.randomBytes(24).toString("hex");   // same format as Register
  const hash = crypto.createHash("sha256").update(key, "utf8").digest("hex");
  const r = db.prepare("UPDATE userapikeys SET keyHash = ? WHERE userId = ?").run(hash, userId);
  if (r.changes !== 1) { console.error("no such user"); process.exit(1); }
  fs.writeFileSync(`C:/dr/data/rekey-${userId}.txt`, key);   // hand it over privately, then delete
  console.log("new key written to C:/dr/data/rekey-" + userId + ".txt");
  ```

  **Do not re-key through the `userapikeystoregister` table.** At boot the metagame first deletes the
  pending rows, then inserts each one into `userapikeys`, where `userId` is the primary key. For an
  existing user that insert fails, the metagame never starts listening, and the pending key is
  already gone.

## Usernames

**Current upstream behaviour:**

- `Register` only checks that the trimmed name is not empty. It then stores the untrimmed string.
- Names are not unique. Two players can both be "Slayer".
- There is no rename. `/account/api/public/account` reports `canUpdateDisplayName: false`.
- On a player's first login the metagame creates their character and names it after the username. A
  rename therefore has to update both `users.name` and `characters.name`.
- Our own owner account still carries the placeholder name "Slayer".

**Our planned rules** (on the roadmap, not built yet):

- The name is chosen at registration. The friend package will ask for it.
- 3-16 characters, letters, digits and underscore only (`^[A-Za-z0-9_]{3,16}$`), after trimming.
- Unique regardless of case, enforced by a migration that adds a unique index on `lower(name)`.
- Checked before the invite code is used up, so a rejected name does not burn a code.
- Rename later, by the player or by an admin, updating both tables. It takes effect at the next login.
  Whether other players' nameplates update without a relog is unverified.
- Maybe an in-game rename, if the client offers one once `canUpdateDisplayName` is true (untested).

Until then, tell friends the rules before they register, and check `GetAllUsers` for clashes.

## Capacity

Measured on our host, an 8-core desktop with 32 GB of RAM, running the 1.4.4 stack:

| Process | RAM | CPU | Notes |
|:--------|----:|----:|:------|
| Ramsgate server | 1.1 GB | ~0.2 core | Always running. |
| Hunt server | ~0.9 GB | not measured under combat | Measured on the tutorial hunt. One per group of up to 4. |
| Training Dojo | ~0.9 GB | ~0.2 core | Only while in use, in our fork. |
| Host's own client at Cinematic | ~1.9 GB | ~2.5 cores | Only if you also play on the host. Working set; its committed (private) memory was about 3.7 GB. |
| Metagame and deploy server (Node) | ~130 MB together | small | |

What that adds up to:

- **Ports are the hard limit, not RAM.** There are 6 hunt ports (8770-8775), so at most 6 hunts run
  at once, each with up to 4 players. Everyone shares one Ramsgate. The cooked 1.4.4 config sets
  `[/Script/Engine.GameSession] MaxPlayers=32`.
- Everything at once (Ramsgate, the Dojo, 6 hunts and your own client) comes to roughly 9.5 GB of
  working set, going by these light-load figures.
- **Our estimate is that 8-12 friends online is comfortable.** We have not load-tested it. Hunt-server
  CPU with 4 players in combat, and Ramsgate's memory growth over long uptimes, are still unmeasured.
- **Upload bandwidth:** the cooked 1.4.4 config caps each client connection at
  `MaxInternetClientRate=100000` bytes per second. That is at most about 0.8 Mbit/s of upload per remote
  player, so six remote players need up to about 5 Mbit/s.

Operational limits to know about:

- Game servers start 10 seconds apart (`SECONDS_TO_WAIT_BETWEEN_GAMESERVER_STARTUP`). The matchmaker
  closes a group when it reaches 4 players, or once 20 seconds pass without anyone new joining it. When
  six groups are ready at once, the last one's server starts about 50 seconds after the first.
- A hunt server exits after **50 seconds in total** with nobody connected, and that counter never
  resets. A friend on a slow disk can arrive after their server is gone. The planned DLL fix makes the
  timeout configurable and resets it on join.
- **When all hunt ports are busy**, the deploy server throws `No free ports left!`, and upstream's
  metagame still marks the group ready, with host `""` and port 0. The players hang. A capacity check
  that refuses cleanly is planned.
- **To add hunt ports, lower `PORT_RANGE_BEGIN`. Never raise `PORT_RANGE_END`.** The DLL treats any
  port of 8776 or above as a persistent server and turns the idle exit off there, so a hunt on such a
  port would never shut down. Widen the firewall rule to match.
- The deploy server puts no memory limit on game processes yet. Planned guard: kill a hunt above about
  2.5 GB or Ramsgate above about 3 GB (Ramsgate then respawns), and refuse new servers when less than
  3 GB of RAM is free.
- **Every game server opens a console window on the host's desktop. Closing one kills that server** for
  everyone in it.

## Keeping the PC available

The server is up only while the host PC is on, awake and signed in.

- **No sleep or hibernation** on mains power. Letting the display turn off is fine.

  ```powershell
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  ```

- **Windows Update restarts.** Set active hours to cover your play times (Windows allows up to 18
  hours), or pause updates before a session. On our host the active hours were 08-17, so evening
  sessions were exposed to automatic restarts.
- **Stay signed in.** Lock the screen instead of signing out. The game servers run in your session and
  read your account's `Game.ini`. Running them as a Windows service (session 0) is untested.
- **Start Tailscale before the stack**, because the metagame binds to the Tailscale address.
- **One command starts and stops the stack, but after a reboot nothing restarts on its own yet.** On
  our host, a `stack.ps1` script with `start`, `stop`, `restart` and `status` already runs the whole
  stack and backs up the database before every start and after every stop. It works locally but is
  not in the repository yet (item 1.1 on the [roadmap]({{ roadmap_page.url | relative_url }})). Still
  planned for milestone M4: starting it from a scheduled task at logon, and a supervisor that restarts
  a crashed metagame or deploy server with backoff.

## Back up the database

Everything players own (accounts, characters, inventories, loadouts, invite codes) lives in one SQLite
file, the `DB_FILENAME` in the metagame `.env`. Ours is `C:\dr\data\undaunted.db`. It is small, 132 KB
with one player or about 25 KB per character, so keeping many copies costs nothing.

**The metagame runs any pending database migrations on every start, and takes no backup first.** Always
back up before updating the fork or pulling upstream changes.

**What our host does.** A hidden scheduled task backs the database up every hour and keeps the newest
48 copies plus the newest copy of each of the last 30 days. `stack.ps1` also takes a backup before
every start and after every stop, and it won't start the metagame if that backup fails. A restore test
passed. These scripts work on our host but are not in the repository yet (items 0.1 and 1.1 on the
[roadmap]({{ roadmap_page.url | relative_url }})). Copies off the PC are still open. On any other host,
use one of the two options below.

**Option 1: stopped copy.** Stop the metagame and copy the file. The database uses SQLite's default
rollback journal, so there is no separate `-wal` file to forget.

**Option 2: live backup.** SQLite's online backup API is safe while the metagame is writing, and
`better-sqlite3` (already a metagame dependency) exposes it. Save this as `backup-db.js` in the
`UndauntedMetagame` folder, so that `require` finds the module:

```js
// node backup-db.js  -> C:/dr/backups/undaunted-YYYYMMDDHHMM.db (UTC time)
const Database = require("better-sqlite3");
const fs = require("fs");
const src = "C:/dr/data/undaunted.db";
const dir = "C:/dr/backups";
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const out = `${dir}/undaunted-${stamp}.db`;
new Database(src, { readonly: true, fileMustExist: true }).backup(out).then(() => {
  const check = new Database(out, { readonly: true }).pragma("integrity_check", { simple: true });
  console.log(out, check);   // prints "ok" for a sound copy
});
```

- Run it hourly with Task Scheduler while hosting, and before every update. Keep a rolling set, for
  example 48 hourly and 90 daily copies, and copy the dailies off the PC.
- **To restore:** stop the metagame, copy a backup over `DB_FILENAME`, then start the metagame.
- The backups contain every player's username and inventory, so keep them private.

**Back up the secrets separately, encrypted, and never in git.** Both `.env` files are already
git-ignored. They hold the metagame's JWT signing key pair and the deploy server's gameserver key. Also
back up the owner's account key.

- Losing the signing keys only invalidates tokens that are already issued. Generate a new pair and
  everyone logs in again as normal.
- Losing the owner key locks you out of the admin API until you replace its hash in the database (see
  `rekey.js` above).

## Before the first friend connects

1. `.env`: `AUTH_MODE=APIKEY`, `NODE_ENV=production`, `REGISTRATION_MODE=INVITECODE`.
2. Tailscale is installed, starts unattended, and the machine is shared with each friend.
3. The two firewall rules exist, scoped to the Tailscale interface. TCP 61001 is not open.
4. `MY_IP`, `QOS_TARGET_URL` and the metagame's `BIND_HOST` point at the Tailscale address. So do the
   `Game.ini` endpoint block and your own client's backend.
5. A database backup exists, and the hourly task is on.
6. Sleep is off, and the Windows Update active hours cover your play time.
7. The AGPL requirements are covered. Friends use the modified metagame over the network, so they are
   entitled to its source (section 13). The DLLs you hand them also need their source available
   (section 6). Give them the link to [this site's repository]({{ site.github.repository_url }}) and
   the commit you run. Upstream's in-game status text (`/dauntless-status`) still reads "Welcome to
   Undaunted v0.0.5!". We plan to put the source link there. See
   [Credits and license]({{ legal_page.url | relative_url }}). It is not legal advice.

# Windows Server kit

Installs and runs a Dauntless Revived server on Windows Server 2019 or newer (Desktop Experience).
Full guide: `docs/setup/windows-server.md` (on the site: Setup > Windows server kit).

| Script | Runs on | What it does |
|:-------|:--------|:-------------|
| `Deploy-Remote.ps1` | your PC | Uploads the kit, the code, a backup and the game zip (resumable, SHA-256 checked) over key-only SSH, runs the installer, prints the invite fingerprint. Also `-Update`, `-InviteFor <name>`, `-Status`. |
| `Install-DauntlessServer.ps1` | the server | `-Mode Public` (TLS gateway, pinned certificate, UDP allowlist) or `-Mode Private` (Tailscale). Idempotent; `-WhatIf` shows every change. |
| `Stack.ps1` | the server | `status`, `start`, `stop`, `restart [-Only <component>]`; `supervise` runs inside the scheduled tasks. |
| `New-Invite.ps1` | the server | Creates an invite code and prints the v2 (public) or v1 (private) invite line. |
| `Get-ServerStatus.ps1` | anywhere | Players and running worlds, through the gateway with the pinned certificate (`-Invite '<line>'` from any PC). |
| `Update-DauntlessServer.ps1` | the server | New code, built beside the running server, switched in with a health check and automatic rollback. |
| `Backup-DauntlessServer.ps1`, `backup-hidden.vbs` | the server | Hourly backup: database (online backup, checked), settings, keys, gateway certificate. |
| `Receive-Upload.ps1` | the server | The server side of the chunked upload. |
| `DauntlessServer.Common.ps1`, `lib\*.js` | both | Shared helpers: pins, invites, pinned HTTPS, database and key tools. |

Tests for a development PC (no system changes, spare ports 62000-62499 only): `tests\Test-KitUnit.ps1`,
`tests\Test-Sandbox.ps1`, `tests\Test-DeployRemote.ps1`.

Windows PowerShell 5.1, ASCII only. Nothing in the kit prints a key, a token, a password or a `.env`
value.

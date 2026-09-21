<#
.SYNOPSIS
    Shows who is online and which worlds and hunts are running on a Dauntless Revived server.

.DESCRIPTION
    Calls GET /undaunted/api/ServerStatus (no key needed) and prints the server's name and version, the
    players online and where they are, and every running game server (Ramsgate, the Training Dojo,
    hunts) with its player count.

    Where it asks:
      (nothing)          this machine's own server (data\config\server.json). In public mode it goes
                         through the gateway with TLS pinned to the certificate fingerprint, the way a
                         friend's launcher does; -Direct asks the metagame on 127.0.0.1 instead.
      -Invite <string>   the server in an invite: v2 over TLS pinned to its fp, v1 over Tailscale.
      -Server <host[:port]> [-Fingerprint <64 hex>]
                         any server; with -Fingerprint over TLS (port 443 unless given), without it
                         plain HTTP on the private-mode port 61000.

    Exit code 0 when the server answered, 1 when it did not.

.EXAMPLE
    C:\DauntlessRevived\bin\Get-ServerStatus.ps1
.EXAMPLE
    .\Get-ServerStatus.ps1 -Invite 'dauntless-revived://join?v=2&mode=public&host=203.0.113.7&port=443&fp=...&code=...&name=...'
.EXAMPLE
    .\Get-ServerStatus.ps1 -Server 100.101.102.103 -Json
#>
[CmdletBinding(DefaultParameterSetName = 'Local')]
param(
    [Parameter(ParameterSetName = 'Local')][string]$Root,
    [Parameter(ParameterSetName = 'Local')][switch]$Direct,
    [Parameter(ParameterSetName = 'Invite', Mandatory = $true)][string]$Invite,
    [Parameter(ParameterSetName = 'Server', Mandatory = $true)][string]$Server,
    [Parameter(ParameterSetName = 'Server')][string]$Fingerprint,
    [switch]$Json,
    [int]$TimeoutSec = 8
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\DauntlessServer.Common.ps1"

function Format-Age([int]$Seconds) {
    if ($Seconds -lt 90) { return "$Seconds s" }
    if ($Seconds -lt 5400) { return "$([math]::Round($Seconds / 60)) min" }
    if ($Seconds -lt 172800) { return "$([math]::Round($Seconds / 3600, 1)) h" }
    return "$([math]::Round($Seconds / 86400, 1)) days"
}

try {
    $fp = $null
    $scheme = 'http'
    if ($Invite) {
        try { $inv = ConvertFrom-DRInviteString $Invite } catch { Stop-DR "That is not a valid invite ($($_.Exception.Message))." }
        $base = '{0}:{1}' -f $inv.Host, $inv.Port
        if ($inv.Mode -eq 'public') { $scheme = 'https'; $fp = $inv.Fingerprint }
    } elseif ($Server) {
        $base = $Server.Trim().ToLowerInvariant()
        if ($Fingerprint) {
            $fp = $Fingerprint.Trim().ToLowerInvariant()
            if (-not (Test-DRFingerprint $fp)) { Stop-DR '-Fingerprint must be 64 hex characters (the fp of the invite).' }
            $scheme = 'https'
            if ($base -notmatch ':\d+$') { $base = "${base}:443" }
        } elseif ($base -notmatch ':\d+$') { $base = "${base}:61000" }
        $hostPart = $base.Substring(0, $base.LastIndexOf(':'))
        if (-not (Test-DRHost $hostPart)) { Stop-DR "'$Server' is not an address." }
    } else {
        $Root = Resolve-DRRoot $Root $PSScriptRoot
        $Cfg = Get-DRConfig $Root
        if ((Get-DRMode $Cfg) -eq 'Public' -and -not $Direct) {
            $scheme = 'https'
            $fp = [string](Get-DRConfigValue $Cfg 'CertFingerprint' '')
            $base = '127.0.0.1:{0}' -f (Get-DRPort $Cfg 'gateway')
        } else {
            $base = '{0}:{1}' -f (Get-DRConfigValue $Cfg 'BindAddress' '127.0.0.1'), (Get-DRPort $Cfg 'metagame')
        }
    }
    $url = "${scheme}://$base"
    $via = if ($scheme -eq 'https') { "$base, TLS pinned to $($fp.Substring(0, 16))..." } else { $base }

    $r = Invoke-DRHttp -Url "$url/undaunted/api/ServerStatus" -Fingerprint $fp -TimeoutSec $TimeoutSec
    if ($r.Status -eq 0) {
        Write-Host "OFFLINE  $via does not answer ($($r.Error))" -ForegroundColor Red
        if ($scheme -eq 'https') {
            if ($r.SeenFingerprint -and $r.SeenFingerprint -ne $fp) {
                Write-Host '         The server presented a DIFFERENT certificate. Either the server was reinstalled with a new'
                Write-Host '         certificate (ask the host for a new invite) or someone is in between. Do not connect.'
            } else {
                Write-Host '         Check: the host''s stack is running (Stack.ps1 status), and the gateway port is open'
                Write-Host '         in the server''s firewall and at the provider.'
            }
        } else {
            Write-Host '         Check: the host''s stack is running (Stack.ps1 status), Tailscale is connected on both ends,'
            Write-Host '         and the host has shared the machine with you.'
        }
        exit 1
    }
    if ($r.Status -eq 404) {
        # A metagame from before ServerStatus existed: at least say whether it is up.
        $s = Invoke-DRHttp -Url "$url/dauntless-status" -Fingerprint $fp -TimeoutSec $TimeoutSec
        $reg = Invoke-DRHttp -Url "$url/undaunted/api/RegistrationStatus" -Fingerprint $fp -TimeoutSec $TimeoutSec
        if ($Json) { Write-Output (@{ online = ($s.Status -eq 200 -or $reg.Status -eq 200); registration = $reg.Json.RegistrationMode } | ConvertTo-Json -Compress); exit 0 }
        Write-Host "ONLINE   $via (this server version does not report players or game servers)" -ForegroundColor Green
        if ($reg.Json) { Write-Host "         registration: $($reg.Json.RegistrationMode)" }
        exit 0
    }
    if ($r.Status -ne 200 -or -not $r.Json) {
        Write-Host "ERROR    $via answered HTTP $($r.Status)" -ForegroundColor Red
        exit 1
    }
    if ($Json) { Write-Output $r.Text; exit 0 }

    $s = $r.Json
    $commit = "$($s.commit)"
    if ($commit.Length -gt 12 -and $commit -match '^[0-9a-f]{40}') { $commit = $commit.Substring(0, 12) + $commit.Substring(40) }
    Write-Host ("ONLINE   {0}  ({1})" -f $s.name, $via) -ForegroundColor Green
    Write-Host ("         version {0}, code {1}, up {2}, registration {3}" -f $s.version, $commit, (Format-Age ([int]$s.uptimeSeconds)), $s.registration)
    if ($s.sourceUrl) { Write-Host "         source: $($s.sourceUrl)" }
    if ($scheme -eq 'https') { Write-Host '         game downloads: through the gateway (/content/)' }
    elseif ($null -ne $s.contentPort) { Write-Host "         game downloads: port $($s.contentPort)" }
    Write-Host ''

    $players = @($s.players)
    Write-Host ("Players online: {0}" -f $s.playersOnline) -ForegroundColor Cyan
    $titles = @{}
    foreach ($i in @($s.instances)) { $titles["$($i.id)"] = $i.title }
    $where = @{ menu = 'in the menus'; city = 'in the city'; hunt = 'on a hunt'; dojo = 'in the Training Dojo'; tutorial = 'in the tutorial'; unknown = 'somewhere' }
    foreach ($p in ($players | Sort-Object name)) {
        $w = $where["$($p.where)"]; if (-not $w) { $w = "$($p.where)" }
        if ($p.instance -and $titles["$($p.instance)"]) { $w = "$w - $($titles["$($p.instance)"])" }
        Write-Host ('  {0,-16} {1}' -f $p.name, $w)
    }
    Write-Host ''

    $inst = @($s.instances)
    Write-Host ("Worlds and hunts running: {0}" -f $inst.Count) -ForegroundColor Cyan
    foreach ($i in ($inst | Sort-Object @{ Expression = { @('city', 'dojo', 'tutorial', 'hunt').IndexOf("$($_.kind)") } }, title)) {
        $since = ''
        try { $since = Format-Age ([int]((Get-Date).ToUniversalTime() - ([datetime]$i.startedAt).ToUniversalTime()).TotalSeconds) } catch {}
        $extra = if ($i.behemoth) { "  behemoth: $($i.behemoth)" } else { '' }
        Write-Host ('  {0,-28} {1}/{2} players  running {3}{4}' -f $i.title, $i.players, $i.maxPlayers, $since, $extra)
    }
    exit 0
} catch {
    if ("$_" -notmatch '^DRFAIL:') { Write-Host "   FAIL  $_" -ForegroundColor Red }
    exit 1
}

<#
.SYNOPSIS
    Enables or disables the loopback-only experimental chat listener on an installed public server.
.DESCRIPTION
    The public gateway already forwards WebSocket upgrades to this port. This changes only
    metagame.env and restarts the stack; it does not open a firewall port. Chat protocol
    compatibility with the 1.4.4 client is still under test.
.EXAMPLE
    .\Set-ExperimentalChat.ps1 -Enable
.EXAMPLE
    .\Set-ExperimentalChat.ps1 -Disable
#>
[CmdletBinding(DefaultParameterSetName = 'Enable')]
param(
    [string]$Root = 'C:\DauntlessRevived',
    [Parameter(ParameterSetName = 'Enable', Mandatory = $true)][switch]$Enable,
    [Parameter(ParameterSetName = 'Disable', Mandatory = $true)][switch]$Disable
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\DauntlessServer.Common.ps1"

$exitCode = 0
try {
    $Root = Resolve-DRRoot $Root $PSScriptRoot
    $paths = Get-DRPaths $Root
    $config = Get-DRConfig $Root
    if (-not (Test-DRAdmin)) { Stop-DR 'Run this in an elevated PowerShell.' }
    if ((Get-DRMode $config) -ne 'Public') { Stop-DR 'Experimental chat currently requires public gateway mode.' }
    if (-not (Test-Path -LiteralPath $paths.MetaEnv)) { Stop-DR "Missing $($paths.MetaEnv)." }
    $port = if ([bool](Get-DRConfigValue $config 'Sandbox' $false)) { 62099 } else { $DRChatPort }
    $envMap = Read-DREnv $paths.MetaEnv
    $previous = [IO.File]::ReadAllText($paths.MetaEnv)
    $envMap['EXPERIMENTAL_CHAT'] = if ($Enable) { '1' } else { '0' }
    $envMap['CHAT_BIND_HOST'] = '127.0.0.1'
    $envMap['CHAT_PORT'] = "$port"
    if (-not (Write-DREnv $paths.MetaEnv $envMap @('Dauntless Revived - holds secrets: never share, commit or paste it.'))) {
        Write-DROk 'chat setting is already in place'
        exit 0
    }
    $stack = Join-Path $paths.Bin 'Stack.ps1'
    try {
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $stack stop -Root $Root -NoBackup
        if ($LASTEXITCODE -ne 0) { throw 'Stack stop failed' }
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $stack start -Root $Root -NoBackup
        if ($LASTEXITCODE -ne 0) { throw 'Stack start failed' }
        $listener = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $listener = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
            if ([bool]$listener -eq [bool]$Enable) { break }
            Start-Sleep -Seconds 1
        }
        if ([bool]$listener -ne [bool]$Enable) { throw "Chat listener on 127.0.0.1:$port did not reach the requested state" }
        Write-DROk "experimental chat $(if ($Enable) { 'enabled' } else { 'disabled' }); gateway forwards WebSockets to 127.0.0.1:$port"
    } catch {
        $reason = $_.Exception.Message
        Write-DRText -Path $paths.MetaEnv -Text $previous
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $stack stop -Root $Root -NoBackup
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $stack start -Root $Root -NoBackup
        Stop-DR "Chat setting rolled back after restart/health check failed: $reason. Check logs in $($paths.Logs)."
    }
} catch {
    if ("$_" -notmatch '^DRFAIL:') { Write-Host "   FAIL  $_" -ForegroundColor Red }
    $exitCode = 1
}
exit $exitCode

$ErrorActionPreference = 'Stop'

function Stop-TrackedNode([string]$Name, [string]$PidFile) {
    if (-not (Test-Path -LiteralPath $PidFile)) {
        Write-Host "$Name is not tracked as running."
        return
    }

    $trackedPid = [int](Get-Content -LiteralPath $PidFile -Raw)
    $process = Get-Process -Id $trackedPid -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        Write-Host "$Name is already stopped."
        return
    }
    if ($process.ProcessName -ne 'node') {
        throw "$PidFile points to $($process.ProcessName), not node; refusing to stop it."
    }

    Stop-Process -Id $trackedPid
    Wait-Process -Id $trackedPid -Timeout 10 -ErrorAction SilentlyContinue
    Write-Host "$Name stopped."
}

# Stop the watchdog first. Otherwise it intentionally starts Ramsgate again.
Stop-TrackedNode 'Deploy server' 'C:\dr\data\deploy.pid'

Get-CimInstance Win32_Process -Filter "Name='Dauntless-Win64-Shipping.exe'" |
    Where-Object { $_.CommandLine -match '(?i)(^|\s)-server(\s|$)' } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
        Write-Host "Dedicated game server $($_.ProcessId) stopped."
    }

Stop-TrackedNode 'Metagame' 'C:\dr\data\metagame.pid'
Write-Host 'Local server stack is stopped.'

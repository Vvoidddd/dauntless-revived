param(
    [ValidateRange(1, 3600)]
    [int]$IntervalSeconds = 60,
    [string]$OutputPath = 'C:\dr\data\performance.csv',
    [string]$PidDirectory = 'C:\dr\data',
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$previousCpu = @{}
$previousTime = Get-Date
$processorCount = [Environment]::ProcessorCount

do {
    $now = Get-Date
    $elapsed = ($now - $previousTime).TotalSeconds
    $freeMb = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024, 1)
    $tracked = @()

    foreach ($name in @('metagame', 'deploy')) {
        $pidPath = Join-Path $PidDirectory "$name.pid"
        if (Test-Path -LiteralPath $pidPath) {
            $trackedPid = 0
            if ([int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(), [ref]$trackedPid)) {
                $process = Get-Process -Id $trackedPid -ErrorAction SilentlyContinue
                if ($process -and $process.ProcessName -eq 'node') {
                    $tracked += [pscustomobject]@{ Role = $name; Process = $process }
                }
            }
        }
    }

    $gameProcesses = @(Get-CimInstance Win32_Process -Filter "Name='Dauntless-Win64-Shipping.exe'" |
        Where-Object { $_.CommandLine -match '(?i)(^|\s)-server(\s|$)' })
    foreach ($gameProcess in $gameProcesses) {
        $port = 'unknown'
        # The dedicated-server DLL takes the UDP port as its second positional
        # argument. Only inspect that prefix; never write API keys or arguments.
        if ($gameProcess.CommandLine -match '(?i)Dauntless-Win64-Shipping\.exe"?\s+\S+\s+(\d{4,5})\s') {
            $port = $Matches[1]
        }
        $process = Get-Process -Id $gameProcess.ProcessId -ErrorAction SilentlyContinue
        if ($process) {
            $role = if ($port -eq '8777') { 'ramsgate' } elseif ($port -eq '8776') { 'dojo' } else { 'hunt' }
            $tracked += [pscustomobject]@{ Role = $role; Port = $port; Process = $process }
        }
    }

    $rows = @([pscustomobject]@{
        timestamp_utc = $now.ToUniversalTime().ToString('o')
        role = 'host'
        pid = ''
        port = ''
        working_set_mb = ''
        cpu_percent = ''
        free_memory_mb = $freeMb
    })
    $rows += foreach ($entry in $tracked) {
        $process = $entry.Process
        $cpuSeconds = $process.CPU
        $cpuPercent = 0
        if ($elapsed -gt 0 -and $previousCpu.ContainsKey($process.Id)) {
            $cpuPercent = [math]::Round([math]::Max(0, ($cpuSeconds - $previousCpu[$process.Id]) / $elapsed / $processorCount * 100), 1)
        }
        $previousCpu[$process.Id] = $cpuSeconds
        [pscustomobject]@{
            timestamp_utc = $now.ToUniversalTime().ToString('o')
            role = $entry.Role
            pid = $process.Id
            port = if ($entry.Port) { $entry.Port } else { '' }
            working_set_mb = [math]::Round($process.WorkingSet64 / 1MB, 1)
            cpu_percent = $cpuPercent
            free_memory_mb = $freeMb
        }
    }

    $rows | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Append
    $previousTime = $now
    if (-not $Once) { Start-Sleep -Seconds $IntervalSeconds }
} while (-not $Once)

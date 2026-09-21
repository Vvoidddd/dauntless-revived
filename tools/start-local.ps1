param(
    [switch]$Windowed,
    [ValidateRange(-1, 4)]
    [int]$Graphics = 3
)

$ErrorActionPreference = 'Stop'
$runtimeRoot = 'C:\dr\undaunted'
$dataRoot = 'C:\dr\data'
$playScript = Join-Path $PSScriptRoot 'play-local.ps1'

function Test-TcpListener([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-TcpListener([int]$Port, [int]$Seconds = 15) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (Test-TcpListener $Port) { return }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw "Nothing started listening on TCP port $Port within $Seconds seconds."
}

function Start-NodeService(
    [string]$Name,
    [int]$Port,
    [string]$WorkingDirectory,
    [string]$LogName
) {
    if (Test-TcpListener $Port) {
        Write-Host "$Name is already running on TCP $Port."
        return
    }

    $stdout = Join-Path $dataRoot "$LogName.log"
    $stderr = Join-Path $dataRoot "$LogName.err"
    $process = Start-Process -FilePath 'node' `
        -ArgumentList @('--env-file=.env', 'dist/server.js') `
        -WorkingDirectory $WorkingDirectory `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Set-Content -LiteralPath (Join-Path $dataRoot "$LogName.pid") -Value $process.Id -Encoding ASCII
    Wait-TcpListener $Port
    Write-Host "$Name started on TCP $Port."
}

if (-not (Test-Path -LiteralPath 'C:\D144\Dauntless\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe')) {
    throw 'The verified Dauntless 1.4.4 client is missing from C:\D144\Dauntless.'
}
if (-not (Test-Path -LiteralPath 'C:\dr\data\owner.key')) {
    throw 'The local account key is missing from C:\dr\data\owner.key.'
}

New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
Start-NodeService 'Metagame' 61000 (Join-Path $runtimeRoot 'UndauntedMetagame') 'metagame'
Start-NodeService 'Deploy server' 61001 (Join-Path $runtimeRoot 'UndauntedDeployServer') 'deploy'

$deadline = (Get-Date).AddSeconds(20)
do {
    if (Get-NetUDPEndpoint -LocalPort 8777 -ErrorAction SilentlyContinue) { break }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
if (-not (Get-NetUDPEndpoint -LocalPort 8777 -ErrorAction SilentlyContinue)) {
    throw 'The Ramsgate server did not bind UDP 8777 within 20 seconds.'
}
Write-Host 'Ramsgate is ready on UDP 8777.'

$arguments = @('-Graphics', $Graphics)
if ($Windowed) { $arguments += '-Windowed' }
& $playScript @arguments

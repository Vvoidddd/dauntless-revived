param(
    [string]$Backend = '127.0.0.1:61000',
    [ValidateRange(-1, 4)]
    [int]$Graphics = 3,
    [switch]$Windowed
)

$ErrorActionPreference = 'Stop'
$configDirectory = Join-Path $env:LOCALAPPDATA 'Archon\Saved\Config\WindowsClient'
New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
$enginePath = Join-Path $configDirectory 'Engine.ini'
$systemSettings = @(
    '[SystemSettings]',
    'r.Streaming.PoolSize=3000',
    'r.Streaming.LimitPoolSizeToVRAM=1',
    'gc.TimeBetweenPurgingPendingKillObjects=10',
    's.ForceGCAfterLevelStreamedOut=1'
)
$qualityGroups = 'ViewDistance','AntiAliasing','Shadow','PostProcess','Texture','Effects','Foliage','Shading'
if ($Graphics -ge 0) {
    $systemSettings += $qualityGroups | ForEach-Object { "sg.${_}Quality=$Graphics" }
    $systemSettings += 'sg.ResolutionQuality=100','r.ScreenPercentage=100','r.MipMapLODBias=0','r.MaxAnisotropy=16','r.Tonemapper.Sharpen=0.6'
}
$xmpp = '[OnlineSubsystemMcp.XMPP]','ServerAddr="ws://127.0.0.1"','ServerPort=61099','bUseSSL=false'
$existing = if (Test-Path -LiteralPath $enginePath) { Get-Content -LiteralPath $enginePath } else { @() }
$kept = [System.Collections.Generic.List[string]]::new()
$skip = $false
foreach ($line in $existing) {
    if ($line -match '^\[(SystemSettings|OnlineSubsystemMcp\.XMPP)\]') { $skip = $true; continue }
    if ($skip -and $line -match '^\[') { $skip = $false }
    if (-not $skip) { $kept.Add($line) }
}
Set-Content -LiteralPath $enginePath -Encoding ASCII -Value ($systemSettings + '' + $xmpp + '' + $kept)

$binaryDirectory = 'C:\D144\Dauntless\Archon\Binaries\Win64'
$accountKey = (Get-Content -LiteralPath 'C:\dr\data\owner.key' -Raw).Trim()
$arguments = @(
    $Backend,
    "-AUTH_PASSWORD=$accountKey",
    '-AUTH_LOGIN=unused', '-AUTH_TYPE=exchangecode',
    '-epicapp=appidlol', '-epicenv=Prod', '-EpicPortal',
    '-epicusername=usernamelol', '-epicuserid=useridlol',
    '-epiclocale=en-US', '-culture=en',
    '-epicsandboxid=sandboxidlol', '-epicdeploymentid=deploymentidlol'
)
if ($Windowed) { $arguments += '-windowed','-ResX=1280','-ResY=720' }
$client = Start-Process (Join-Path $binaryDirectory 'Dauntless-Win64-Shipping.exe') `
    -WorkingDirectory $binaryDirectory -ArgumentList $arguments -PassThru
Set-Content -LiteralPath 'C:\dr\data\client.pid' -Value $client.Id -Encoding ASCII
Write-Host "Client started (PID $($client.Id))."

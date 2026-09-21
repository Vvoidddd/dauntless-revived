<#
.SYNOPSIS
    Unit checks for the Windows Server kit: script parsing, invite strings (v1 and v2), certificate
    fingerprints, TLS pinning, Get-ServerStatus with and without an account key, account key files
    and the chunked-upload helper. Touches nothing outside -WorkDir and one loopback port (-Port,
    default 62450).

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\windows-server\tests\Test-KitUnit.ps1 -WorkDir $env:TEMP\dr-kit-unit
#>
param(
    [string]$WorkDir = (Join-Path $env:TEMP 'dr-kit-unit'),
    [ValidateRange(62000, 62499)][int]$Port = 62450
)
$ErrorActionPreference = 'Stop'
$Kit = Split-Path $PSScriptRoot -Parent
. (Join-Path $Kit 'DauntlessServer.Common.ps1')

$script:Pass = 0; $script:Fail = 0
function Check([string]$Name, [bool]$Ok, [string]$Detail = '') {
    if ($Ok) { $script:Pass++; Write-Host "  ok    $Name" -ForegroundColor Green }
    else { $script:Fail++; Write-Host "  FAIL  $Name  $Detail" -ForegroundColor Red }
}
function ParseError([string]$Text) { try { [void](ConvertFrom-DRInviteString $Text); return '' } catch { return "$($_.Exception.Message)" } }

if (Test-Path -LiteralPath $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

Write-Host '== scripts parse (PowerShell 5.1), ASCII only'
foreach ($f in @(Get-ChildItem -LiteralPath $Kit -Filter *.ps1) + @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter *.ps1)) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errors)
    $nonAscii = @([IO.File]::ReadAllBytes($f.FullName) | Where-Object { $_ -gt 127 }).Count
    Check "$($f.Name) parses" ($errors.Count -eq 0) (($errors | ForEach-Object { "line $($_.Extent.StartLineNumber): $($_.Message)" }) -join '; ')
    Check "$($f.Name) is ASCII" ($nonAscii -eq 0) "$nonAscii bytes > 127"
}

Write-Host '== invite strings'
$fp = 'ab' * 32
$v2 = New-DRInviteString -Mode Public -ServerHost '203.0.113.7' -Port 443 -Fingerprint $fp -Code 'ABCD-EFGH-JKLM' -Name "Alex's Ramsgate"
Check 'v2 layout' ($v2 -ceq "dauntless-revived://join?v=2&mode=public&host=203.0.113.7&port=443&fp=$fp&code=ABCD-EFGH-JKLM&name=Alex's%20Ramsgate") $v2
$p = ConvertFrom-DRInviteString $v2
Check 'v2 round trip' ($p.Version -eq 2 -and $p.Mode -eq 'public' -and $p.Host -eq '203.0.113.7' -and $p.Port -eq 443 -and $p.Fingerprint -eq $fp -and $p.Code -eq 'ABCD-EFGH-JKLM' -and $p.Name -eq "Alex's Ramsgate")
$v1 = New-DRInviteString -Mode Private -ServerHost '100.101.102.103' -Port 61000 -Code 'ABCD-EFGH-JKLM' -Name 'Home' -ShareUrl 'https://login.tailscale.com/admin/invite/abc'
$p1 = ConvertFrom-DRInviteString $v1
Check 'v1 round trip' ($p1.Version -eq 1 -and $p1.Mode -eq 'private' -and $p1.Port -eq 61000 -and $p1.Share -eq 'https://login.tailscale.com/admin/invite/abc' -and $null -eq $p1.Fingerprint)
Check 'v2 DNS host' ((ConvertFrom-DRInviteString "dauntless-revived://join?v=2&mode=public&host=play.example.org&port=8443&fp=$fp&code=abcd&name=x").Host -eq 'play.example.org')
Check 'v2 host is lower-cased' ((ConvertFrom-DRInviteString "dauntless-revived://join?v=2&mode=public&host=Play.Example.ORG&port=443&fp=$fp&code=abcd&name=x").Host -eq 'play.example.org')
Check 'join/? form accepted' ((ParseError "dauntless-revived://join/?v=2&mode=public&host=1.2.3.4&port=443&fp=$fp&code=abcd&name=x") -eq '')
$base = "dauntless-revived://join?v=2&mode=public&host=203.0.113.7&port=443&fp=$fp&code=ABCD-EFGH&name=x"
$bad = [ordered]@{
    'v2 without fp'              = @("dauntless-revived://join?v=2&mode=public&host=1.2.3.4&port=443&code=abcd&name=x", 'fp')
    'v2 upper-case fp'           = @(($base -replace "fp=$fp", ('fp=' + $fp.ToUpperInvariant())), 'fp')
    'v2 short fp'                = @(($base -replace "fp=$fp", ('fp=' + $fp.Substring(1))), 'fp')
    'v2 non-hex fp'              = @(($base -replace "fp=$fp", ('fp=' + ('g' * 64))), 'fp')
    'v2 mode=private'            = @(($base -replace 'mode=public', 'mode=private'), 'mode')
    'v2 without mode'            = @(($base -replace 'mode=public&', ''), 'mode')
    'v2 with share'              = @("$base&share=https%3A%2F%2Flogin.tailscale.com%2Fx", 'params')
    'v1 with fp'                 = @("dauntless-revived://join?v=1&host=100.64.0.1&port=61000&fp=$fp&code=abcd&name=x", 'params')
    'v1 with mode'               = @('dauntless-revived://join?v=1&mode=public&host=100.64.0.1&port=61000&code=abcd&name=x', 'params')
    'unknown parameter'          = @("$base&extra=1", 'params')
    'duplicate parameter'        = @("$base&code=WXYZ", 'params')
    'empty pair'                 = @("$base&", 'params')
    'fragment'                   = @("$base#x", 'params')
    'version 3'                  = @(($base -replace 'v=2', 'v=3'), 'version')
    'no version'                 = @(($base -replace 'v=2&', ''), 'version')
    'host with underscore'       = @(($base -replace 'host=203.0.113.7', 'host=my_host'), 'host')
    'host 1.2.3'                 = @(($base -replace 'host=203.0.113.7', 'host=1.2.3'), 'host')
    'host 256.1.1.1'             = @(($base -replace 'host=203.0.113.7', 'host=256.1.1.1'), 'host')
    'port 0'                     = @(($base -replace 'port=443', 'port=0'), 'port')
    'port 65536'                 = @(($base -replace 'port=443', 'port=65536'), 'port')
    'port 0443'                  = @(($base -replace 'port=443', 'port=0443'), 'port')
    'code too short'             = @(($base -replace 'code=ABCD-EFGH', 'code=abc'), 'code')
    'code with space'            = @(($base -replace 'code=ABCD-EFGH', 'code=AB%20CD'), 'code')
    'name with a control char'   = @(($base -replace 'name=x', 'name=a%07b'), 'name')
    'name with a bidi override'  = @(($base -replace 'name=x', 'name=a%E2%80%AEb'), 'name')
    'name empty'                 = @(($base -replace 'name=x', 'name=%20'), 'name')
    'other scheme'               = @(($base -replace '^dauntless-revived', 'https'), 'not_invite')
    'empty'                      = @('   ', 'empty')
}
foreach ($k in $bad.Keys) { $e = ParseError $bad[$k][0]; Check "rejects: $k" ($e -eq $bad[$k][1]) "got '$e'" }
$threw = $false; try { [void](New-DRInviteString -Mode Public -ServerHost '1.2.3.4' -Port 443 -Code 'abcd' -Name 'x') } catch { $threw = $true }
Check 'v2 generator refuses a missing fingerprint' $threw
$threw = $false; try { [void](New-DRInviteString -Mode Public -ServerHost '1.2.3.4' -Port 443 -Fingerprint $fp -Code 'abcd' -Name 'x' -ShareUrl 'https://login.tailscale.com/x') } catch { $threw = $true }
Check 'v2 generator refuses a share link' $threw

Write-Host '== addresses and .env values'
foreach ($a in '203.0.113.7', '10.1.2.3', '100.64.0.1', '127.0.0.1', '172.20.0.1', '192.168.1.1', '169.254.1.1', '224.0.0.1', '0.1.2.3') { Check "not public: $a" (-not (Test-DRPublicIPv4 $a)) }
foreach ($a in '8.8.8.8', '95.216.1.2', '172.32.0.1', '100.128.0.1', '192.0.1.1') { Check "public: $a" (Test-DRPublicIPv4 $a) }
foreach ($a in '1.2.3.4', '1.2.3.0/24', '10.0.0.0/8') { Check "admin ip ok: $a" (Test-DRIPv4Cidr $a) }
foreach ($a in '1.2.3.0/33', '1.2.3.0/4', 'any', '1.2.3', '::1') { Check "admin ip refused: $a" (-not (Test-DRIPv4Cidr $a)) }
$threw = $false; try { [void](Format-DREnvValue 'a"b') } catch { $threw = $true }
Check '.env refuses a quote' $threw
Check '.env quotes spaces' ((Format-DREnvValue "Alex's Ramsgate") -ceq '"Alex''s Ramsgate"')
Check 'PowerShell literal' ((ConvertTo-DRPsLiteral "it's") -ceq "'it''s'")
$envFile = Join-Path $WorkDir 'x.env'
[void](Write-DREnv $envFile ([ordered]@{ A = '1'; SERVER_NAME = 'Two words'; C = 'x=y' }) @('header'))
$back = Read-DREnv $envFile
Check '.env round trip' ($back['A'] -eq '1' -and $back['SERVER_NAME'] -eq 'Two words' -and $back['C'] -eq 'x=y')
Check '.env unchanged write reports no change' (-not (Write-DREnv $envFile ([ordered]@{ A = '1'; SERVER_NAME = 'Two words'; C = 'x=y' }) @('header')))

Write-Host '== certificate fingerprint and TLS pinning'
$gw = Join-Path (Split-Path $Kit -Parent | Split-Path -Parent) 'UndauntedGateway'
$makeCert = Join-Path $gw 'tools\make-cert.js'
$node = (Get-Command node.exe).Source
$server = $null
if (-not (Test-Path -LiteralPath (Join-Path $gw 'node_modules\node-forge'))) {
    Check 'UndauntedGateway\node_modules present (npm ci there first)' $false
} else {
    $cert = Join-Path $WorkDir 'cert.pem'; $key = Join-Path $WorkDir 'key.pem'
    $out = & $node $makeCert --host 127.0.0.1 --host test.invalid --cert $cert --key $key --json 2>&1 | Out-String
    $info = $out | ConvertFrom-Json
    $mine = Get-DRCertFingerprint $cert
    Check 'fingerprint matches make-cert' ($mine -eq $info.fingerprint -and (Test-DRFingerprint $mine)) "$mine vs $($info.fingerprint)"
    $ci = Get-DRCertInfo $cert
    Check 'certificate valid about 10 years' ($ci.NotAfter -gt (Get-Date).AddYears(9)) "$($ci.NotAfter)"
    Check 'certificate names' ($ci.San -match '127\.0\.0\.1' -and $ci.San -match 'test\.invalid') $ci.San

    # A stand-in ServerStatus like the metagame's: the player list only for the one account key it
    # knows (a made-up test key), else the limited answer.
    $testKey = 'UUK_' + ('5e7a' * 12)
    $js = Join-Path $WorkDir 'tls-server.js'
    Set-Content -LiteralPath $js -Encoding ASCII -Value @"
const https = require('https'); const fs = require('fs');
const known = process.argv[5];
const s = https.createServer({ cert: fs.readFileSync(process.argv[2]), key: fs.readFileSync(process.argv[3]) }, (req, res) => {
  if (req.url !== '/undaunted/api/ServerStatus') {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ name: 'pin test', path: req.url }));
  }
  const full = req.headers['x-undaunted-user-api-key'] === known;
  const at = new Date(Date.now() - 600000).toISOString();
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ name: 'pin test', online: true, version: '1.0.0', commit: 'abc1234', sourceUrl: 'https://github.com/mixutin/dauntless-revived', registration: 'INVITECODE',
    playersOnline: full ? 2 : 0,
    players: full ? [{ name: 'Aurora', where: 'city', instance: 'c1' }, { name: 'Borealis', where: 'hunt', instance: 'h1' }] : [],
    instances: full ? [{ id: 'c1', kind: 'city', title: 'Ramsgate', map: 'ramsgate_01', behemoth: null, players: 1, maxPlayers: 32, startedAt: at },
                       { id: 'h1', kind: 'hunt', title: 'Hunt: Shrike', map: 'island', behemoth: 'Shrike', players: 1, maxPlayers: 4, startedAt: at }] : [],
    contentPort: null, uptimeSeconds: 60, limited: !full }));
});
s.listen(Number(process.argv[4]), '127.0.0.1', () => console.log('listening'));
"@
    $psi = New-Object Diagnostics.ProcessStartInfo($node, ('"{0}" "{1}" "{2}" {3} {4}' -f $js, $cert, $key, $Port, $testKey))
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.RedirectStandardOutput = $true
    $server = [Diagnostics.Process]::Start($psi)
    try {
        [void]$server.StandardOutput.ReadLine()
        $ok = Invoke-DRHttp -Url "https://127.0.0.1:$Port/undaunted/api/ServerStatus" -Fingerprint $mine -TimeoutSec 5
        Check 'pinned TLS with the right fingerprint' ($ok.Status -eq 200 -and $ok.Json.name -eq 'pin test' -and $ok.SeenFingerprint -eq $mine) "$($ok.Status) $($ok.Error)"
        $wrong = ('0' * 63) + '1'
        $no = Invoke-DRHttp -Url "https://127.0.0.1:$Port/undaunted/api/ServerStatus" -Fingerprint $wrong -TimeoutSec 5
        Check 'pinned TLS refuses another certificate' ($no.Status -eq 0 -and $no.Error -match 'fingerprint mismatch' -and $no.SeenFingerprint -eq $mine) "$($no.Status) $($no.Error)"
        $none = Invoke-DRHttp -Url "https://127.0.0.1:$Port/undaunted/api/ServerStatus" -TimeoutSec 5
        Check 'https without a fingerprint is refused before connecting' ($none.Status -eq 0 -and $none.Error -match 'fingerprint')
        $gs = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Kit 'Get-ServerStatus.ps1') -Server "127.0.0.1:$Port" -Fingerprint $wrong 2>&1 | Out-String
        Check 'Get-ServerStatus warns about a different certificate' ($LASTEXITCODE -eq 1 -and $gs -match 'DIFFERENT certificate') $gs

        # The player list is for registered players only: with the key it shows, without it the
        # script says it is hidden (never "0 players"), and the key is never printed.
        function GetStatus([string[]]$More) {
            $o = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Kit 'Get-ServerStatus.ps1') -Server "127.0.0.1:$Port" -Fingerprint $mine @More 2>&1 | Out-String
            return [pscustomobject]@{ Code = $LASTEXITCODE; Text = $o }
        }
        $keyFile = Join-Path $WorkDir 'account.key'
        [IO.File]::WriteAllText($keyFile, "$testKey`r`n")
        $backupFile = Join-Path $WorkDir 'key-backup.txt'
        [IO.File]::WriteAllText($backupFile, "Dauntless Revived account key`r`n`r`nServer: pin test (127.0.0.1:$Port)`r`nUsername: Aurora`r`nKey: $testKey`r`n`r`nKeep this file private.`r`n")
        $wrongFile = Join-Path $WorkDir 'wrong.key'
        [IO.File]::WriteAllText($wrongFile, 'UUK_' + ('0' * 48))
        $none = GetStatus @()
        Check 'no key: the list is hidden, not "0 players"' ($none.Code -eq 0 -and $none.Text -match 'Player list hidden: this server shows who is online' -and $none.Text -match 'pass -KeyFile' -and $none.Text -notmatch 'Players online' -and $none.Text -notmatch 'Worlds and hunts running') $none.Text
        $with = GetStatus @('-KeyFile', $keyFile)
        Check 'with -KeyFile: players and worlds listed' ($with.Code -eq 0 -and $with.Text -match 'Players online: 2' -and $with.Text -match 'Aurora\s+in the city - Ramsgate' -and $with.Text -match 'Worlds and hunts running: 2' -and $with.Text -notmatch 'hidden') $with.Text
        Check 'with -KeyFile: the key is not printed' (-not $with.Text.Contains($testKey) -and -not $none.Text.Contains($testKey))
        $bk = GetStatus @('-KeyFile', $backupFile)
        Check '-KeyFile takes the launcher''s key backup file' ($bk.Code -eq 0 -and $bk.Text -match 'Players online: 2') $bk.Text
        $wr = GetStatus @('-KeyFile', $wrongFile)
        Check 'a key the server does not accept: hidden, and says so' ($wr.Code -eq 0 -and $wr.Text -match 'Player list hidden' -and $wr.Text -match 'did not accept the key in') $wr.Text
        $js0 = GetStatus @('-Json')
        $j = $null; try { $j = $js0.Text | ConvertFrom-Json } catch {}
        Check '-Json passes the limited answer through unchanged' ($j -and $j.limited -eq $true -and $j.playersOnline -eq 0 -and $j.name -eq 'pin test') $js0.Text
        $plain = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Kit 'Get-ServerStatus.ps1') -Server '203.0.113.7' -KeyFile $keyFile -TimeoutSec 1 2>&1 | Out-String
        Check 'no key over plain HTTP to a public address' ($LASTEXITCODE -eq 1 -and $plain -match 'goes only over TLS pinned') $plain
    } finally { if ($server -and -not $server.HasExited) { $server.Kill(); $server.WaitForExit(5000) | Out-Null } }
}

Write-Host '== account keys'
$kd = Join-Path $WorkDir 'keys'
New-Item -ItemType Directory -Force -Path $kd | Out-Null
[IO.File]::WriteAllText((Join-Path $kd 'plain.key'), "  UUK_abcdef0123456789  `r`n")
[IO.File]::WriteAllText((Join-Path $kd 'junk.txt'), "not a key at all`r`nsecond line")
Check 'key file: the key alone, trimmed' ((Read-DRAccountKey (Join-Path $kd 'plain.key')) -ceq 'UUK_abcdef0123456789')
Check 'key file: no key in it -> $null' ($null -eq (Read-DRAccountKey (Join-Path $kd 'junk.txt')))
foreach ($h in '127.0.0.1', 'localhost', '100.64.0.1', '100.127.255.254', 'box.tail1234.ts.net') { Check "key over plain HTTP allowed: $h" (Test-DRPlainKeyHost $h) }
foreach ($h in '203.0.113.7', '100.128.0.1', '10.0.0.5', 'ts.net', 'example.org', 'evil.ts.net.example.org') { Check "key over plain HTTP refused: $h" (-not (Test-DRPlainKeyHost $h)) }

Write-Host '== chunked upload helper (Receive-Upload.ps1)'
$up = Join-Path $WorkDir 'upload'
New-Item -ItemType Directory -Force -Path $up | Out-Null
$data = New-Object byte[] (2.5MB); (New-Object Random 7).NextBytes($data)
$chunk = 1MB
$segs = @(); $hashes = @(); for ($i = 0; $i -lt 3; $i++) { $len = [math]::Min($chunk, $data.Length - $i * $chunk); $seg = New-Object byte[] $len; [Array]::Copy($data, $i * $chunk, $seg, 0, $len); $segs += ,$seg; $sha = [Security.Cryptography.SHA256]::Create(); $hashes += (ConvertTo-DRHex $sha.ComputeHash($seg)) }
$sha = [Security.Cryptography.SHA256]::Create(); $whole = ConvertTo-DRHex $sha.ComputeHash($data)
Write-DRText -Path (Join-Path $up 'upload.json.incoming') -Text (@{ name = 'test.zip'; size = $data.Length; sha256 = $whole; chunkSize = $chunk; chunks = $hashes } | ConvertTo-Json -Compress)
function Recv([string]$Action, [int]$Index = -1) {
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Kit 'Receive-Upload.ps1'), '-Action', $Action, '-Dir', $up)
    if ($Index -ge 0) { $a += @('-Index', "$Index") }
    $l = & powershell.exe @a 2>&1 | Where-Object { "$_" -match '^DRJSON:' } | Select-Object -Last 1
    return ("$l".Substring(7) | ConvertFrom-Json)
}
$b = Recv 'Begin'
Check 'Begin: nothing verified yet' (-not $b.complete -and @($b.verified).Count -eq 0 -and $b.count -eq 3)
for ($i = 0; $i -lt 3; $i++) { [IO.File]::WriteAllBytes((Join-Path $up ('part{0:D5}' -f $i)), $segs[$i]) }
Check 'Verify part 1' ((Recv 'Verify' 0).ok -and (Recv 'Verify' 1).ok)
$f = [IO.File]::Open((Join-Path $up 'part00002'), 'Open', 'ReadWrite'); $f.WriteByte(1); $f.Dispose()
$v = Recv 'Verify' 2
Check 'Verify refuses a damaged part and deletes it' (-not $v.ok -and $v.reason -eq 'hash' -and -not (Test-Path -LiteralPath (Join-Path $up 'part00002')))
$a = Recv 'Assemble'
Check 'Assemble reports the missing part' (-not $a.complete -and @($a.missing) -contains 2)
$seg = New-Object byte[] ($data.Length - 2 * $chunk); [Array]::Copy($data, 2 * $chunk, $seg, 0, $seg.Length); [IO.File]::WriteAllBytes((Join-Path $up 'part00002'), $seg)
[void](Recv 'Verify' 2)
$a = Recv 'Assemble'
Check 'Assemble completes with the right SHA-256' ($a.complete -and (Get-DRSha256 (Join-Path $up 'test.zip')).ToLowerInvariant() -eq $whole) ($a | ConvertTo-Json -Compress)
Write-DRText -Path (Join-Path $up 'upload.json.incoming') -Text (@{ name = 'test.zip'; size = $data.Length; sha256 = $whole; chunkSize = $chunk; chunks = $hashes } | ConvertTo-Json -Compress)
Check 'Begin after completion reports complete' ((Recv 'Begin').complete)

Write-Host ''
Write-Host "unit checks: $script:Pass passed, $script:Fail failed" -ForegroundColor $(if ($script:Fail) { 'Red' } else { 'Green' })
Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
exit $(if ($script:Fail) { 1 } else { 0 })

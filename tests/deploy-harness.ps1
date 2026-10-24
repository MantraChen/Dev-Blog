param([string]$Scenario)
. "$PSScriptRoot/../deploy/deploy.ps1"
$Repository = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Repository | Out-Null
$script:actions = [System.Collections.Generic.List[string]]::new()
function Get-ServiceSetting([string]$Name) {
    switch ($Name) {
        'Application' { return 'old-node' }
        'AppDirectory' { return 'old-directory' }
        'AppParameters' { return 'old-entry' }
        'AppEnvironmentExtra' { return "DATABASE_PATH=$Repository/data.db`nADMIN_PASSWORD_HASH=test`nHOST=127.0.0.1`nPORT=4321" }
    }
}
function Prepare-Release {
    $script:actions.Add('prepare')
    if ($Scenario -eq 'build-fail') { throw 'Build failed' }
    return @{ Path = $Repository; Commit = 'new-commit' }
}
function Stop-Blog { $script:actions.Add('stop') }
function Start-Blog {
    $alreadyStarted = $script:actions.Contains('start')
    $script:actions.Add('start')
    if ($Scenario -eq 'start-fail' -and !$alreadyStarted) { throw 'NSSM start failed' }
}
function nssm { $global:LASTEXITCODE = 0 }
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    if ($Arguments[0] -like '*migrate.mjs') {
        $script:actions.Add('migrate')
        if ($Scenario -eq 'migration-fail') { throw 'Migration failed' }
    }
}
function Set-ServiceSetting([string]$Name, [string]$Value) { $script:actions.Add("set:$Name=$Value") }
function Wait-BlogHealthy {
    $script:actions.Add('health')
    if ($Scenario -eq 'health-fail') { throw 'Unhealthy' }
}
$failed = $false
try { Invoke-Deployment } catch { $failed = $true }
if ($Scenario -eq 'success' -and $failed) { throw 'Successful deployment failed' }
if ($Scenario -ne 'success' -and !$failed) { throw 'Failure was swallowed' }
if ($Scenario -eq 'build-fail' -and $script:actions.Contains('stop')) { throw 'Build failure stopped the live blog' }
if ($Scenario -eq 'migration-fail' -and !$script:actions.Contains('start')) { throw 'Migration failure did not restart the old service' }
if ($Scenario -in @('health-fail', 'start-fail') -and !$script:actions.Contains('set:AppDirectory=old-directory')) { throw 'Failure did not roll back service configuration' }
if ($Scenario -eq 'success' -and !$script:actions.Contains('health')) { throw 'Health check was skipped' }
# Delete only the known files created by this harness; no recursive removal.
Remove-Item -LiteralPath (Join-Path $Repository '.deploy.lock')
Remove-Item -LiteralPath $Repository
Write-Host "PASS $Scenario"

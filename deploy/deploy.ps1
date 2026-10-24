param(
    [string]$Repository = $(if ($env:DEPLOY_DIR) { $env:DEPLOY_DIR } else { Split-Path $PSScriptRoot -Parent }),
    [string]$ServiceName = $(if ($env:SERVICE_NAME) { $env:SERVICE_NAME } else { "dev-blog" }),
    [string]$Branch = $(if ($env:DEPLOY_BRANCH) { $env:DEPLOY_BRANCH } else { "main" })
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
function Get-ServiceSetting([string]$Name) {
    $value = & nssm get $ServiceName $Name
    if ($LASTEXITCODE -ne 0) { throw "Cannot read NSSM setting $Name" }
    return (($value -join "`n") -replace "`0", "").Trim()
}
function Set-ServiceSetting([string]$Name, [string]$Value) {
    Invoke-Checked nssm @("set", $ServiceName, $Name, $Value)
}
function Stop-Blog { Invoke-Checked nssm @("stop", $ServiceName) }
function Start-Blog { Invoke-Checked nssm @("start", $ServiceName) }

function Prepare-Release([string]$Root, [string]$Ref) {
    Push-Location $Root
    try {
        Invoke-Checked git @("check-ref-format", "--branch", $Ref)
        Invoke-Checked git @("fetch", "origin", $Ref)
        $commit = (& git rev-parse --verify "FETCH_HEAD^{commit}").Trim()
        if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[a-f0-9]{40,64}$') { throw "Invalid deployment commit" }
        $releaseRoot = Join-Path $Root ".releases"
        $release = Join-Path $releaseRoot ($commit.Substring(0, 12) + "-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $release -Force | Out-Null
        $archive = Join-Path $release "source.zip"
        Invoke-Checked git @("archive", "--format=zip", "--output=$archive", $commit)
        Expand-Archive -LiteralPath $archive -DestinationPath $release
        Push-Location $release
        $oldRelease = $env:PUBLIC_RELEASE_ID
        try {
            $env:PUBLIC_RELEASE_ID = $commit
            Invoke-Checked node @("scripts/check-runtime.mjs")
            Invoke-Checked npm.cmd @("ci", "--no-fund")
            Invoke-Checked npm.cmd @("run", "verify")
            Invoke-Checked npm.cmd @("audit", "--omit=dev", "--audit-level=high")
        } finally {
            $env:PUBLIC_RELEASE_ID = $oldRelease
            Pop-Location
        }
        return @{ Path = $release; Commit = $commit }
    } finally { Pop-Location }
}

function Wait-BlogHealthy([string]$HealthUrl, [string]$Commit) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
            if ($health.status -eq "ok" -and (!$Commit -or $health.release -eq $Commit)) { return }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw "Health check did not pass: $HealthUrl"
}

function Invoke-Deployment {
    $root = (Resolve-Path -LiteralPath $Repository).Path
    # Serialize webhook and manual runs. File handle is released even after failure.
    $lock = [System.IO.File]::Open((Join-Path $root ".deploy.lock"), "OpenOrCreate", "ReadWrite", "None")
    $previousDatabase = $env:DATABASE_PATH
    $switched = $false
    $stopped = $false
    try {
        $oldDirectory = Get-ServiceSetting "AppDirectory"
        $oldParameters = Get-ServiceSetting "AppParameters"
        $oldApplication = Get-ServiceSetting "Application"
        $environment = Get-ServiceSetting "AppEnvironmentExtra"
        $settings = @{}
        foreach ($line in ($environment -split "\r?\n")) {
            if ($line -match '^([^=]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
        }
        if (!$settings["DATABASE_PATH"] -or ![System.IO.Path]::IsPathRooted($settings["DATABASE_PATH"])) {
            throw "Configure an absolute DATABASE_PATH in the blog NSSM service before deploying (deploy/setup.md)."
        }
        if (!$settings["ADMIN_PASSWORD_HASH"]) { throw "Configure ADMIN_PASSWORD_HASH in the blog NSSM service." }
        if ($settings["HOST"] -ne "127.0.0.1") { throw "The blog NSSM service must set HOST=127.0.0.1 behind Caddy." }
        $blogPort = if ($settings["PORT"]) { [int]$settings["PORT"] } else { 4321 }
        $healthUrl = "http://127.0.0.1:$blogPort/api/health"
        $env:DATABASE_PATH = $settings["DATABASE_PATH"]

        Write-Host "Preparing release while the existing blog stays online..."
        $release = Prepare-Release $root $Branch
        if (!$release.Path -or !$release.Commit) { throw "Release preparation failed" }
        $node = (Get-Command node -ErrorAction Stop).Source

        $stopped = $true
        Stop-Blog
        # migrate.mjs makes a consistent SQLite backup before any pending migration.
        Invoke-Checked $node @((Join-Path $release.Path "scripts/migrate.mjs"))
        $switched = $true
        Set-ServiceSetting "Application" $node
        Set-ServiceSetting "AppDirectory" $release.Path
        Set-ServiceSetting "AppParameters" "dist/server/entry.mjs"
        Start-Blog
        Wait-BlogHealthy $healthUrl $release.Commit
        Write-Host "Deployed $($release.Commit). Previous release retained at $oldDirectory"
    } catch {
        $failure = $_
        if ($stopped) {
            Write-Warning "Deployment failed; restoring the previous service configuration."
            try {
                # It may already be stopped. Ignore stop failure, but check configuration/start.
                & nssm stop $ServiceName *> $null
                if ($switched) {
                    Set-ServiceSetting "Application" $oldApplication
                    Set-ServiceSetting "AppDirectory" $oldDirectory
                    Set-ServiceSetting "AppParameters" $oldParameters
                }
                Start-Blog
                # Older releases have no /api/health; retain original failure and report service status.
                Invoke-Checked nssm @("status", $ServiceName)
                Write-Warning "Previous service restarted. Database backup retained; database was not overwritten."
            } catch { Write-Error "Rollback failed: $($_.Exception.Message)" -ErrorAction Continue }
        }
        throw $failure
    } finally {
        $env:DATABASE_PATH = $previousDatabase
        $lock.Dispose()
    }
}
if ($MyInvocation.InvocationName -ne ".") {
    try { Invoke-Deployment } catch { Write-Error $_ -ErrorAction Continue; exit 1 }
}

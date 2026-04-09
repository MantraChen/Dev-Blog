$ErrorActionPreference = "Continue"

function Log($msg) { Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] $msg" }

Log "Starting deploy..."

# Pull latest code (retry up to 3 times)
$pullOk = $false
for ($i = 1; $i -le 3; $i++) {
    Log "git pull attempt $i..."
    $output = & git pull origin main 2>&1 | Out-String
    Write-Output $output
    if ($LASTEXITCODE -eq 0) {
        $pullOk = $true
        break
    }
    Log "git pull failed, retrying in 5s..."
    Start-Sleep -Seconds 5
}

if (-not $pullOk) {
    Log "git pull failed after 3 attempts"
    exit 1
}
Log "git pull success"

# Install dependencies
Log "npm install..."
$output = & npm install --production=false 2>&1 | Out-String
Write-Output $output
if ($LASTEXITCODE -ne 0) { Log "npm install failed"; exit 1 }

# Build
Log "npm run build..."
$output = & npm run build 2>&1 | Out-String
Write-Output $output
if ($LASTEXITCODE -ne 0) { Log "build failed"; exit 1 }

# Restart service
Log "Restarting service..."
$output = & nssm restart dev-blog 2>&1 | Out-String
Write-Output $output

Log "Deploy complete!"

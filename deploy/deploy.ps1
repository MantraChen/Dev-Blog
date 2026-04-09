$ErrorActionPreference = "Stop"

Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] Starting deploy..."

# Pull latest code (retry up to 3 times)
$pullOk = $false
for ($i = 1; $i -le 3; $i++) {
    Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] git pull attempt $i..."
    git pull origin main 2>&1
    if ($LASTEXITCODE -eq 0) {
        $pullOk = $true
        break
    }
    Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] git pull failed, retrying in 5s..."
    Start-Sleep -Seconds 5
}

if (-not $pullOk) {
    Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] git pull failed after 3 attempts"
    exit 1
}
Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] git pull success"

# Install dependencies
Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] npm install..."
npm install --production=false 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] npm install failed"
    exit 1
}

# Build
Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] npm run build..."
npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] build failed"
    exit 1
}

# Restart service
Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] Restarting service..."
nssm restart dev-blog 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] nssm restart failed"
    exit 1
}

Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] Deploy complete!"

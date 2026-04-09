# Auto-Deploy Setup Guide (Windows Server)

## 1. Generate Webhook Secret

```powershell
# Generate a random secret
[System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }) -as [byte[]])
```

Save this secret, you'll need it in step 2 and 3.

## 2. Register Webhook Service with NSSM

Open **Administrator PowerShell**:

```powershell
# Install the webhook listener as a Windows service
nssm install dev-blog-webhook "C:\Program Files\nodejs\node.exe" "C:\path\to\dev-blog\deploy\webhook.js"

# Set environment variables
nssm set dev-blog-webhook AppEnvironmentExtra ^
    WEBHOOK_SECRET=your_secret_here ^
    WEBHOOK_PORT=9000 ^
    DEPLOY_DIR=C:\path\to\dev-blog ^
    SERVICE_NAME=dev-blog

# Set working directory
nssm set dev-blog-webhook AppDirectory "C:\path\to\dev-blog"

# Configure logging
nssm set dev-blog-webhook AppStdout "C:\path\to\dev-blog\deploy\webhook-stdout.log"
nssm set dev-blog-webhook AppStderr "C:\path\to\dev-blog\deploy\webhook-stderr.log"

# Start the service
nssm start dev-blog-webhook
```

## 3. Configure GitHub Webhook

1. Go to your repo → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL**: `https://yourdomain.com/webhook` (or `http://server-ip:9000/webhook`)
3. **Content type**: `application/json`
4. **Secret**: paste the secret from step 1
5. **Events**: select "Just the push event"

## 4. Caddy Reverse Proxy (optional)

If you want the webhook behind Caddy (recommended for HTTPS), add to your Caddyfile:

```
yourdomain.com {
    # Blog
    reverse_proxy /webhook localhost:9000
    reverse_proxy * localhost:4321
}
```

Or use a subdomain:

```
deploy.yourdomain.com {
    reverse_proxy localhost:9000
}
```

## 5. Verify

```powershell
# Check service status
nssm status dev-blog-webhook

# Health check
curl http://localhost:9000/health

# View logs
Get-Content C:\path\to\dev-blog\deploy\deploy.log -Tail 20
```

## File Overview

- `webhook.js` - HTTP server that receives GitHub webhooks, verifies signature, triggers deploy
- `deploy.bat` - Pulls code, installs deps, builds, restarts service
- `deploy.log` - Auto-generated deploy log

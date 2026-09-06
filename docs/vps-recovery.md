# GizzyFx VPS Recovery Playbook

> **If your Ubuntu VPS dies, here's exactly how to rebuild on a fresh server.**

## What's SAFE (no action needed)

| Component | Location | Survives? |
|-----------|----------|-----------|
| Cloudflare Worker | Cloudflare edge | ✅ |
| D1 Database | Cloudflare | ✅ |
| KV Namespace | Cloudflare | ✅ |
| GitHub repos | github.com/gizzyfxclaw | ✅ |
| Deployed JS bundles | Cloudflare | ✅ |
| Secrets (NOUS_API_KEY, AUTH_*, TVREMIX_*, FINNHUB_*) | Cloudflare | ✅ |
| Domain (gizzyfxstrategy.dpdns.org) | Cloudflare | ✅ |

## What's LOST (must rebuild)

| Component | Location | Recovery |
|-----------|----------|----------|
| smc-processor.sh | /home/ubuntu/bin/ | Rebuild from repo |
| auth.json | /home/ubuntu/.hermes/ | Re-create on new VPS |
| .env | /home/ubuntu/.hermes/ | Re-create on new VPS |
| Local repo clone | /home/ubuntu/prop-farm-navigator | git clone |
| hermes-webui | /opt/hermes-webui | git clone + setup |
| Python venv | ~/.hermes/hermes-agent/venv | pip install |
| Crontab | /var/spool/cron | Re-add entries |
| SSH keys | ~/.ssh/ | Generate new + add to GitHub |

---

## Recovery Steps (new Ubuntu VPS)

### 1. Provision & SSH
```bash
# New Ubuntu 22.04/24.04 LTS
ssh root@<new-ip>
adduser ubuntu
usermod -aG sudo ubuntu
```

### 2. Install dependencies
```bash
sudo apt update && sudo apt install -y \
  python3 python3-venv python3-pip \
  nodejs npm git curl wget \
  build-essential

# Install bun
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# Install cloudflare tunnel (cloudflared)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

### 3. Clone repos
```bash
cd /home/ubuntu
git clone https://github.com/gizzyfxclaw/prop-farm-navigator.git
git clone https://github.com/gizzyfxclaw/gizzyfx-skills.git
```

### 4. Set up auth.json (Nous API key)
```bash
mkdir -p /home/ubuntu/.hermes
cat > /home/ubuntu/.hermes/auth.json << 'EOF'
{
  "providers": {
    "nous": {
      "access_token": "<YOUR_NOUS_API_KEY>"
    }
  }
}
EOF
```
> Get your key from: https://inference-api.nousresearch.com → Account → API Keys

### 5. Set up .env
```bash
cat > /home/ubuntu/.hermes/.env << 'EOF'
GIZZYFX_BASE_URL=https://gizzyfxstrategy.dpdns.org
GIZZYFX_API_KEY=<YOUR_HERMES_KEY>
EOF
```

### 6. Set up Python venv + dependencies
```bash
python3 -m venv /home/ubuntu/.hermes/hermes-agent/venv
source /home/ubuntu/.hermes/hermes-agent/venv/bin/activate
pip install requests playwright Pillow
playwright install chromium
```

### 7. Set up smc-processor.sh
```bash
mkdir -p /home/ubuntu/bin
cp /home/ubuntu/prop-farm-navigator/scripts/smc-processor.sh /home/ubuntu/bin/
chmod +x /home/ubuntu/bin/smc-processor.sh
```

### 8. Set up crontab
```bash
crontab -e
# Add:
*/5 * * * * /home/ubuntu/bin/smc-processor.sh >> /home/ubuntu/.hermes/smc-processor.log 2>&1
```

### 9. Set up hermes-webui (if needed)
```bash
cd /opt
sudo git clone https://github.com/gizzyfxclaw/hermes-webui.git
# Follow hermes-webui setup instructions
```

### 10. Set up GitHub SSH (for pushes)
```bash
ssh-keygen -t ed25519 -C "gizzyfxclaw"
cat ~/.ssh/id_ed25519.pub
# Add to GitHub → Settings → SSH Keys
```

### 11. Verify
```bash
# Test the processor
/home/ubuntu/bin/smc-processor.sh

# Test deploy
cd /home/ubuntu/prop-farm-navigator
bun run build
npx nitro deploy --prebuilt
```

---

## Future-Proofing: Backup Strategy

### Option A: Automated S3/Cloudflare R2 backup
```bash
# Add to crontab:
0 2 * * * tar -czf /tmp/vps-backup-$(date +\%Y\%m\%d).tar.gz \
  /home/ubuntu/.hermes/auth.json \
  /home/ubuntu/.hermes/.env \
  /home/ubuntu/bin/ \
  /home/ubuntu/.ssh/ \
  /var/spool/cron/crontabs/
# Then upload to R2/S3
```

### Option B: Keep critical files in GitHub (encrypted)
```bash
# Encrypt and commit to a private repo
gpg -c /home/ubuntu/.hermes/auth.json
mv /home/ubuntu/.hermes/auth.json.gpg /home/ubuntu/prop-farm-navigator/secrets/
git add secrets/ && git commit -m "backup: auth.json"
git push
```

### Option C: Use Cloudflare Secrets for everything
- Move ALL secrets to Cloudflare secrets (already done for NOUS_API_KEY, AUTH_*, etc.)
- VPS only needs: auth.json (Nous key) + .env (base URL + hermes key)
- These two files are the only secrets not in Cloudflare

---

## Quick Recovery Checklist

- [ ] New Ubuntu VPS provisioned
- [ ] Dependencies installed (python3, node, bun, cloudflared)
- [ ] Repos cloned from GitHub
- [ ] auth.json created with Nous API key
- [ ] .env created with base URL + hermes key
- [ ] Python venv + playwright installed
- [ ] smc-processor.sh in /home/ubuntu/bin/
- [ ] Crontab entries added
- [ ] GitHub SSH key generated + added
- [ ] Test: smc-processor.sh runs
- [ ] Test: bun run build + deploy succeeds
- [ ] Test: gizzyfxstrategy.dpdns.org loads

---

**Estimated recovery time:** 30-60 minutes (mostly waiting for installs)
**Downtime without this playbook:** Hours of figuring out what's missing

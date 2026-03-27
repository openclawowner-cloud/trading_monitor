# Ubuntu Deployment (Update-Friendly)

This project can run on Ubuntu while keeping Windows local development unchanged.

## 1) Server prerequisites

- Ubuntu 22.04+ (or compatible)
- Node.js 20 LTS
- Python 3.11+ (or your target runtime)
- `git`, `bash`, `systemd`

## 2) Clone and install

```bash
git clone <your-repo-url> /opt/trading-monitor
cd /opt/trading-monitor
npm ci
```

## 3) Environment

Create `/opt/trading-monitor/.env` based on `.env.example`.

Recommended Linux values:

- `PORT=3000`
- `PYTHON_PATH=/usr/bin/python3` (or `/opt/trading-monitor/.venv/bin/python`)
- `BYBIT_API_BASE=https://api.bybit.com` (for live-like paper data)

## 4) Enable Linux agent launcher

The supervisor now supports Linux wrapper `scripts/run-agent.sh`.

```bash
chmod +x /opt/trading-monitor/scripts/run-agent.sh
```

## 5) Systemd service

Copy `deploy/ubuntu/trading-monitor.service` to `/etc/systemd/system/trading-monitor.service`
and adjust `User`, `Group`, and paths if needed.

```bash
sudo cp deploy/ubuntu/trading-monitor.service /etc/systemd/system/trading-monitor.service
sudo systemctl daemon-reload
sudo systemctl enable trading-monitor
sudo systemctl start trading-monitor
sudo systemctl status trading-monitor
```

## 6) Safe update flow (future deployments)

Use `deploy/ubuntu/update.sh`:

```bash
sudo bash /opt/trading-monitor/deploy/ubuntu/update.sh
```

This script:

- fetches latest `main`
- runs `npm ci`
- restarts the service
- verifies health endpoint

## Notes

- Windows local flow keeps using `run-agent.bat`.
- Linux server uses `run-agent.sh`.
- Both are selected automatically by supervisor based on OS.

#!/bin/bash
# RentalHub — Contabo VPS initial setup script
# Run as root: bash setup-server.sh
set -euo pipefail

echo "=== RentalHub Contabo VPS Setup ==="

# --- Firewall (ufw) ---
echo "[1/6] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status verbose

# --- Fail2ban ---
echo "[2/6] Installing/configuring fail2ban..."
apt-get update -qq
apt-get install -y -qq fail2ban

cat > /etc/fail2ban/jail.local << 'F2B'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = 22
logpath = %(sshd_log)s

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
F2B

systemctl enable fail2ban
systemctl restart fail2ban

# --- Swap (prevent OOM on small VPS) ---
echo "[3/6] Setting up swap..."
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap 2G created"
else
  echo "Swap already exists"
fi

# --- Logrotate for app logs ---
echo "[4/6] Configuring logrotate..."
cat > /etc/logrotate.d/rentalhub << 'LOGROTATE'
/path/to/rentalhub/logs/*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
}
LOGROTATE

# Create logs directory
mkdir -p /path/to/rentalhub/logs

# --- PostgreSQL daily backup ---
echo "[5/6] Setting up PostgreSQL daily backup..."
mkdir -p /var/backups/postgresql

cat > /usr/local/bin/rentalhub-backup.sh << 'BACKUP'
#!/bin/bash
BACKUP_DIR="/var/backups/postgresql"
DB_NAME="${RENTALHUB_DB_NAME:-rentalhub}"
DB_USER="${RENTALHUB_DB_USER:-rentalhub}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Dump and compress
pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILENAME"
chmod 640 "$FILENAME"

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +30 -delete

# Log size
echo "$(date): Backup created: $FILENAME ($(du -h "$FILENAME" | cut -f1))"
BACKUP

chmod +x /usr/local/bin/rentalhub-backup.sh

# Add to crontab (daily at 3am)
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/rentalhub-backup.sh >> /var/log/rentalhub-backup.log 2>&1") | crontab -

echo "[6/6] Setup complete!"
echo ""
echo "=== Next steps ==="
echo "1. Install Node.js via nvm (v18+): https://github.com/nvm-sh/nvm"
echo "2. Install PM2: npm i -g pm2"
echo "3. Install PostgreSQL + create database/user"
echo "4. Copy .env and configure"
echo "5. Build client: cd client && npm run build"
echo "6. Start: pm2 start ecosystem.config.js"
echo "7. Setup SSL: certbot --nginx -d yourdomain.com"
echo ""
echo "Backups: /var/backups/postgresql/ (daily 3am, kept 30 days)"
echo "Logs: /path/to/rentalhub/logs/"

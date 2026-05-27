#!/bin/bash

# VibeQuiz — Production Soketi VPS Auto-Setup Script
# This script automates the installation and configuration of:
# 1. Docker & Docker log rotation configuration
# 2. Soketi Server with production configuration (max presence members, logs disabled)
# 3. Nginx Reverse Proxy with secure WebSocket upgrade headers
# 4. Let's Encrypt SSL certificate generation via Certbot
#
# Supported OS: Ubuntu 20.04 / 22.04 / 24.04 LTS
# Run on your fresh VPS as root:
# curl -o- https://raw.githubusercontent.com/DaTaFos/VibeQuiz/main/scripts/setup-soketi-vps.sh | bash

# Ensure the script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: Please run this script as root or with sudo."
  exit 1
fi

set -e # Exit immediately on error

echo "=========================================================="
echo "🚀 VIBEQUIZ PRODUCTION SOKETI SETUP AUTOMATION"
echo "   Target OS: Ubuntu 20.04+ LTS"
echo "=========================================================="

# --- 1. Gather Inputs ---
echo ""
read -p "🌐 Enter your Domain Name (e.g. 104-207-64-199.sslip.io or soketi.domain.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
  echo "❌ Error: Domain Name is required."
  exit 1
fi

read -p "📧 Enter your Email Address (for Let's Encrypt SSL alerts): " EMAIL
if [ -z "$EMAIL" ]; then
  echo "❌ Error: Email is required."
  exit 1
fi

read -p "🔑 Enter Soketi App Key [default: app-key]: " APP_KEY
APP_KEY=${APP_KEY:-app-key}

read -p "🔐 Enter Soketi App Secret [default: app-secret]: " APP_SECRET
APP_SECRET=${APP_SECRET:-app-secret}

read -p "🆔 Enter Soketi App ID [default: app-id]: " APP_ID
APP_ID=${APP_ID:-app-id}

read -p "👥 Enter Maximum Presence Members Limit [default: 1000]: " MAX_MEMBERS
MAX_MEMBERS=${MAX_MEMBERS:-1000}

echo ""
echo "----------------------------------------------------------"
echo "⚙️  CONFIRMATION PROFILE:"
echo "   Domain:      $DOMAIN"
echo "   Email:       $EMAIL"
echo "   App ID:      $APP_ID"
echo "   App Key:     $APP_KEY"
echo "   App Secret:  [HIDDEN]"
echo "   Max Members: $MAX_MEMBERS"
echo "--------------------------------------------------"
read -p "👉 Proceed with installation? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "❌ Installation cancelled."
  exit 0
fi

# --- 2. Update System ---
echo "🔄 Updating packages..."
apt update && apt upgrade -y

# --- 3. Install Docker ---
if ! command -v docker &> /dev/null; then
  echo "🐳 Installing Docker..."
  apt install -y docker.io
  systemctl enable --now docker
else
  echo "✅ Docker is already installed."
fi

# --- 4. Start Soketi Container ---
echo "📡 Launching Soketi Docker Container..."
# Stop and remove existing container if running
docker stop soketi-server &> /dev/null || true
docker rm soketi-server &> /dev/null || true

docker run -p 6001:6001 -d \
  --restart unless-stopped \
  --name soketi-server \
  -e SOKETI_DEBUG=0 \
  -e SOKETI_PRESENCE_MAX_MEMBERS="$MAX_MEMBERS" \
  -e SOKETI_DEFAULT_APP_ID="$APP_ID" \
  -e SOKETI_DEFAULT_APP_KEY="$APP_KEY" \
  -e SOKETI_DEFAULT_APP_SECRET="$APP_SECRET" \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  quay.io/soketi/soketi:1.6-16-alpine

# --- 5. Install Nginx and Certbot ---
echo "🛡️ Installing Nginx & Certbot SSL packages..."
apt install -y nginx certbot python3-certbot-nginx

# --- 6. Configure Nginx Reverse Proxy ---
echo "📝 Writing Nginx reverse proxy configuration..."

cat << EOF > /etc/nginx/sites-available/soketi
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:6001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Activate site, remove default, and test configuration
ln -sf /etc/nginx/sites-available/soketi /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default || true

nginx -t
systemctl restart nginx

# --- 7. Generate Let's Encrypt SSL ---
echo "🔒 Requesting Let's Encrypt SSL Certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

# --- 8. Open Firewalls ---
if command -v ufw &> /dev/null; then
  echo "🔥 Opening UFW firewall ports..."
  ufw allow 'Nginx Full'
fi

echo ""
echo "=========================================================="
echo "🎉 SUCCESS! Soketi is now live and secured over SSL!"
echo "=========================================================="
echo "   WebSocket Endpoint:  wss://$DOMAIN/app/$APP_KEY"
echo "=========================================================="
echo ""
echo "👉 Add the following Environment Variables to Vercel:"
echo "--------------------------------------------------"
echo "NEXT_PUBLIC_PUSHER_KEY=\"$APP_KEY\""
echo "NEXT_PUBLIC_PUSHER_HOST=\"$DOMAIN\""
echo "NEXT_PUBLIC_PUSHER_PORT=\"443\""
echo "NEXT_PUBLIC_PUSHER_TLS=\"true\""
echo ""
echo "PUSHER_SECRET=\"$APP_SECRET\""
echo "PUSHER_SERVER_HOST=\"$DOMAIN\""
echo "PUSHER_SERVER_PORT=\"443\""
echo "PUSHER_SERVER_TLS=\"true\""
echo "--------------------------------------------------"
echo ""

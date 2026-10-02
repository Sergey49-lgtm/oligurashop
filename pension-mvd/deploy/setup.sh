#!/usr/bin/env bash
# Установка калькулятора пенсии МВД на VPS (Ubuntu/Debian) с nginx.
#
#   bash setup.sh                       — сайт по адресу http://IP-сервера/pension-mvd/
#   bash setup.sh pensiya.ru you@mail.ru — сайт на своём домене с HTTPS (Let's Encrypt)
#
# Повторный запуск безопасен: файлы калькулятора просто обновятся.
set -euo pipefail

DOMAIN="${1:-}"
# Кириллический домен (пенсия-мвд.рф) переводим в punycode для nginx и certbot
if [ -n "$DOMAIN" ] && printf '%s' "$DOMAIN" | grep -qP '[^\x00-\x7F]'; then
  DOMAIN="$(python3 -c 'import sys; print(sys.argv[1].lower().encode("idna").decode())' "$DOMAIN")"
fi
EMAIL="${2:-}"
SRC="$(cd "$(dirname "$0")" && pwd)/pension-mvd"
FILES="index.html style.css calc.js app.js"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите от root: sudo bash $0 $*" >&2; exit 1
fi
for f in $FILES; do
  [ -f "$SRC/$f" ] || { echo "Не найден $SRC/$f — запускайте скрипт из распакованного архива." >&2; exit 1; }
done
if [ -d /usr/local/fastpanel2 ] || [ -d /usr/local/mgr5 ] || [ -d /usr/local/hestia ]; then
  echo "На сервере стоит панель управления (FASTPANEL / ISPmanager / Hestia)." >&2
  echo "Создайте сайт в панели и загрузите файлы из папки pension-mvd через её файловый менеджер." >&2
  exit 1
fi

echo "==> Устанавливаю nginx"
apt-get update -q
apt-get install -y -q nginx
systemctl enable --now nginx

# Если включён брандмауэр ufw — открываем порты 80 и 443
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 'Nginx Full'
fi

if [ -z "$DOMAIN" ]; then
  # Без домена: кладём в сайт nginx по умолчанию, конфигурацию не трогаем
  ROOT=/var/www/html/pension-mvd
  mkdir -p "$ROOT"
  for f in $FILES; do install -m 644 "$SRC/$f" "$ROOT/$f"; done
  IP="$(curl -fsS4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
  echo
  echo "Готово: http://$IP/pension-mvd/"
  echo "Для адреса с HTTPS привяжите домен и запустите: bash $0 ваш-домен ваш@email"
  exit 0
fi

ROOT=/var/www/pension-mvd
mkdir -p "$ROOT"
for f in $FILES; do install -m 644 "$SRC/$f" "$ROOT/$f"; done

CONF=/etc/nginx/sites-available/pension-mvd
if [ ! -f "$CONF" ]; then
  echo "==> Создаю конфигурацию nginx для $DOMAIN"
  LISTEN6=""
  if [ -f /proc/net/if_inet6 ]; then LISTEN6="listen [::]:80;"; fi
  cat > "$CONF" <<NGINX
server {
    listen 80;
    $LISTEN6
    server_name $DOMAIN www.$DOMAIN;

    root $ROOT;
    index index.html;
    charset utf-8;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # Файлы обновляются с теми же именами — кэшируем ненадолго
    location ~* \.(css|js)\$ {
        add_header Cache-Control "public, max-age=3600";
    }

    gzip on;
    gzip_types text/css application/javascript;
}
NGINX
  ln -sf "$CONF" /etc/nginx/sites-enabled/pension-mvd
fi
nginx -t
systemctl reload nginx

if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "==> Получаю сертификат HTTPS"
  apt-get install -y -q certbot python3-certbot-nginx
  if [ -n "$EMAIL" ]; then MAIL=(-m "$EMAIL"); else MAIL=(--register-unsafely-without-email); fi
  CERT_DOMAINS=(-d "$DOMAIN")
  if getent ahosts "www.$DOMAIN" >/dev/null; then CERT_DOMAINS+=(-d "www.$DOMAIN"); fi
  certbot --nginx --non-interactive --agree-tos --redirect "${MAIL[@]}" "${CERT_DOMAINS[@]}"
fi

echo
echo "Готово: https://$DOMAIN/"

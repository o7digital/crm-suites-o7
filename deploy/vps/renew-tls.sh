#!/bin/sh
set -eu
docker run --rm \
  -v /opt/o7/mailcow/data/assets/ssl/o7-crm/letsencrypt:/etc/letsencrypt \
  -v /opt/o7/mailcow/data/web:/var/www/webroot \
  certbot/certbot:v5.0.0 renew --webroot -w /var/www/webroot --quiet
docker exec mailcowdockerized-nginx-mailcow-1 nginx -t
docker exec mailcowdockerized-nginx-mailcow-1 nginx -s reload

#!/usr/bin/env bash
set -euo pipefail

CONTAINER="esp8266_postgres"
BACKUP_DIR="/home/mastero/backups/esp8266_postgres"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

docker exec "$CONTAINER" pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "$BACKUP_DIR/backup-$TIMESTAMP.sql.gz"

find "$BACKUP_DIR" -name 'backup-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[BACKUP] $(date -Iseconds) OK -> backup-$TIMESTAMP.sql.gz"

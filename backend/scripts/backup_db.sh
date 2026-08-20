#!/usr/bin/env bash
# 원격 Supabase Postgres → 로컬 백업 (schema + data 단일 SQL 파일).
# Docker 불필요 — 네이티브 pg_dump로 DB에 직접 접속해 덤프한다.
#
# 사용법 (어디서든):
#   bash backend/scripts/backup_db.sh
# 또는 backend/ 안에서:
#   ./scripts/backup_db.sh
#
# 산출물: backend/backups/products_<타임스탬프>.sql
#   - 이 폴더는 .gitignore로 제외됨 → 커밋되지 않는다(로컬 전용).
#   - pg_dump 기본 포맷이라 스키마+데이터가 한 파일에 들어가 그대로 복원 가능.
#     복원: psql "$SUPABASE_DB_URL" -f 이파일.sql
#
# 준비:
#   1) pg_dump 설치 (Docker 없이):  brew install libpq
#   2) backend/.env.local 에 접속 문자열 추가:
#        SUPABASE_DB_URL=postgresql://postgres.<ref>:<DB비번>@<host>:5432/postgres
#      (Supabase 대시보드 → Connect → psql/ORM 의 connection string. 세션 풀러 권장.)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

# ── pg_dump 찾기 (PATH → Homebrew libpq 기본 경로) ─────────────────
PG_DUMP="$(command -v pg_dump 2>/dev/null || true)"
if [ -z "$PG_DUMP" ]; then
  for cand in /opt/homebrew/opt/libpq/bin/pg_dump /usr/local/opt/libpq/bin/pg_dump; do
    if [ -x "$cand" ]; then PG_DUMP="$cand"; break; fi
  done
fi
if [ -z "$PG_DUMP" ]; then
  echo "✗ pg_dump 를 못 찾음. 설치하세요:  brew install libpq" >&2
  echo "  (설치 후 PATH에 없으면 이 스크립트가 /opt/homebrew/opt/libpq/bin 을 자동 탐색함)" >&2
  exit 1
fi

# ── 접속 문자열 (환경변수 > backend/.env.local) ───────────────────
DB_URL="${SUPABASE_DB_URL:-}"
if [ -z "$DB_URL" ] && [ -f .env.local ]; then
  # grep 미매치(exit 1)가 set -e 로 스크립트를 죽이지 않도록 || true 로 감쌈
  DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
fi
if [ -z "$DB_URL" ]; then
  echo "✗ SUPABASE_DB_URL 이 없음. backend/.env.local 에 추가하세요:" >&2
  echo "    SUPABASE_DB_URL=postgresql://postgres.<ref>:<DB비번>@<host>:5432/postgres" >&2
  exit 1
fi

BACKUP_DIR="$BACKEND_DIR/backups"
mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/products_${TS}.sql"

echo "▶ pg_dump 로 원격 DB 덤프 중… (schema + data)"
# --no-owner/--no-privileges: 복원 시 역할/권한 차이로 인한 에러 방지
"$PG_DUMP" "$DB_URL" --no-owner --no-privileges -f "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ 백업 완료: $OUT ($SIZE)"

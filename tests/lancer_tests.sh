#!/usr/bin/env bash
# Crée une base jetable, applique les migrations et lance les tests d'accès.
# Usage : PGHOST=... PGPORT=... PGUSER=postgres tests/lancer_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=gestion_com_tests
dropdb --if-exists "$DB" && createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -v ON_ERROR_STOP=1 -d "$DB" -f tests/test_regles.sql

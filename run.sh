#!/usr/bin/env bash
# Sobe API (com simulador e seed) e frontend sem docker. Uso: ./run.sh
# Portas: API_PORT (padrão 8000) e WEB_PORT (padrão 5173). Banco: FOGO_DB (padrão backend/fogo.db). Simulador: FOGO_SIM=0 desliga.
set -euo pipefail
cd "$(dirname "$0")"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

command -v python3 >/dev/null || { echo "python3 (>= 3.12) não encontrado" >&2; exit 1; }
command -v npm >/dev/null || { echo "Node.js 20+ (npm) não encontrado" >&2; exit 1; }
python3 -c 'import sys; sys.exit(sys.version_info < (3, 12))' || { echo "é preciso Python 3.12 ou mais novo" >&2; exit 1; }

[ -d backend/.venv ] || python3 -m venv backend/.venv
backend/.venv/bin/pip install -q -r backend/requirements.txt
[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund)

trap 'kill 0' EXIT
(cd backend && FOGO_CORS="${FOGO_CORS:-http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT}" .venv/bin/uvicorn app.main:app --port "$API_PORT") &
(cd frontend && VITE_API="http://localhost:$API_PORT" npm run dev -- --port "$WEB_PORT") &
echo "API: http://localhost:$API_PORT/docs   Web: http://localhost:$WEB_PORT"
wait

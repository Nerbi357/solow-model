#!/usr/bin/env bash
# Полный прогон: независимый пересчёт таблиц, слепой аудит перебора
# и шесть браузерных наборов. Сам поднимает http.server и сам его гасит.
#
#   bash check/all.sh
#
# Нужен python3 и playwright (playwright-core тоже подойдёт). Браузер можно
# указать через CHROME_PATH, если playwright не нашёл свой.
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8000}"
URL="http://localhost:$PORT/"
export URL

started=""
if ! curl -sf -o /dev/null "$URL"; then
  python3 -m http.server "$PORT" >/dev/null 2>&1 &
  started=$!
  for _ in $(seq 20); do curl -sf -o /dev/null "$URL" && break; sleep 0.3; done
fi
cleanup(){ [ -n "$started" ] && kill "$started" 2>/dev/null; }
trap cleanup EXIT

fails=0
run(){
  printf '\n\033[1m%s\033[0m\n' "$1"; shift
  if "$@"; then :; else fails=$((fails+1)); fi
}

run "Таблицы против независимого пересчёта" python3 check/seminar.py
run "Перебор против заново выписанной модели" node check/audit.js

for f in check/ui-*.js; do
  run "$(sed -n '1s|^/\* ||p' "$f")" node "$f"
done

printf '\n'
if [ "$fails" -eq 0 ]; then
  printf '\033[32mвсё чисто\033[0m\n'
else
  printf '\033[31mнеудачных наборов: %d\033[0m\n' "$fails"
fi
exit "$fails"

#!/usr/bin/env bash
# Полный прогон: независимый пересчёт таблиц, слепой аудит перебора
# и девять браузерных наборов. Сам поднимает http.server и сам его гасит.
#
#   bash check/all.sh            # наборы идут пачками по четыре
#   JOBS=1 bash check/all.sh     # по одному, если нужен живой вывод
#
# Наборы — независимые процессы, каждый со своим браузером, поэтому их
# незачем гонять по очереди: девять подряд занимали пять с половиной минут,
# по четыре сразу — около двух. Вывод собирается в файлы и печатается
# в постоянном порядке, чтобы не перемешивался.
#
# Нужен python3 и playwright (playwright-core тоже подойдёт). Браузер можно
# указать через CHROME_PATH, если playwright не нашёл свой.
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8000}"
URL="http://localhost:$PORT/"
export URL
JOBS="${JOBS:-4}"

started=""
if ! curl -sf -o /dev/null "$URL"; then
  python3 -m http.server "$PORT" >/dev/null 2>&1 &
  started=$!
  for _ in $(seq 20); do curl -sf -o /dev/null "$URL" && break; sleep 0.3; done
fi
logs="$(mktemp -d)"
cleanup(){ [ -n "$started" ] && kill "$started" 2>/dev/null; rm -rf "$logs"; }
trap cleanup EXIT

fails=0
title(){ sed -n '1s|^/\* ||p' "$1"; }
head_()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Пересчёт таблиц идёт первым и один: он ничего не открывает и стоит секунду.
head_ "Таблицы против независимого пересчёта"
python3 check/seminar.py || fails=$((fails+1))

# Голый `wait` ждёт ВСЕ фоновые задачи шелла — в том числе поднятый выше
# http.server, который сам не завершится никогда, и прогон зависает навсегда.
# Ждать надо ровно наборы, поэтому их PID собираются явно.
suites=(check/audit.js check/ui-*.js)
pids=()
for f in "${suites[@]}"; do
  b="$(basename "$f")"
  ( node "$f" >"$logs/$b.log" 2>&1; echo $? >"$logs/$b.rc" ) &
  pids+=($!)
  if [ "${#pids[@]}" -ge "$JOBS" ]; then wait "${pids[@]}"; pids=(); fi
done
[ "${#pids[@]}" -gt 0 ] && wait "${pids[@]}"

for f in "${suites[@]}"; do
  b="$(basename "$f")"
  head_ "$(title "$f")"
  cat "$logs/$b.log" 2>/dev/null
  [ "$(cat "$logs/$b.rc" 2>/dev/null || echo 1)" -eq 0 ] || fails=$((fails+1))
done

printf '\n'
if [ "$fails" -eq 0 ]; then
  printf '\033[32mвсё чисто\033[0m\n'
else
  printf '\033[31mнеудачных наборов: %d\033[0m\n' "$fails"
fi
exit "$fails"

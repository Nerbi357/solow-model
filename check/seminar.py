#!/usr/bin/env python3
"""Независимая проверка таблиц по задачам семинара.

Здесь нарочно НЕ используется ни строчки из index.html: модель выписана
заново, по листкам. Если инструмент и этот скрипт расходятся — значит,
кто-то из них врёт, и надо разбираться, а не подгонять.

Запуск:  python3 check/seminar.py
"""
import itertools, math

LN = math.log

def compare(s0, d0, a0, s1, d1, a1, m):
    """Знаки изменений y, k, c, i в краткосрочном и долгосрочном периоде.

    Всё в логарифмах: при α, близких к единице, показатель 1/(1−α) огромен,
    обычная арифметика переполняется и перебор начинает выдумывать «=».
    """
    lk0 = (LN(s0) - LN(d0)) / (1 - a0)        # исходный стационар
    lk1 = (LN(s1) - LN(d1)) / (1 - a1)        # новый стационар
    lkS = lk0 + LN(m)                         # краткосрочно: запас предопределён
    val = lambda lk, a, s: {"y": a*lk, "k": lk,
                            "c": LN(1-s) + a*lk, "i": LN(s) + a*lk}
    B, S, L = val(lk0, a0, s0), val(lkS, a1, s1), val(lk1, a1, s1)
    sg = lambda x: "=" if abs(x) < 1e-12 else ("↑" if x > 0 else "↓")
    return ([sg(S[v] - B[v]) for v in "ykci"],
            [sg(L[v] - B[v]) for v in "ykci"])

FULL = (0.01, 0.99)
# У нормы сбережений граница ниже: 0,01 — это удобная круглая цифра, а не
# требование модели, и в задаче 5 она в одиночку решала знак ответа. Модели
# нужно лишь s > 0; см. «Диапазоны параметров» в CLAUDE.md.
S_FULL = (0.0005, 0.99)

def solve(free, build, n):
    """Перебирает свободные параметры; если знак где-то переворачивается — «?»."""
    axes = [(k, [lo + (hi-lo)*i/(n-1) for i in range(n)]) for k, (lo, hi) in free.items()]
    got = [{v: set() for v in "ykci"} for _ in range(2)]
    for combo in itertools.product(*[a[1] for a in axes]):
        p = dict(zip([a[0] for a in axes], combo))
        args = build(p)
        s0, d0, a0, s1, d1, a1 = args[:6]
        # d — это сумма δ+n+g; единицей ограничен каждый параметр по
        # отдельности, а не сумма, поэтому здесь только положительность
        if not (0 < s0 < 1 and 0 < s1 < 1 and 0 < a0 < 1 and 0 < a1 < 1
                and d0 > 0 and d1 > 0):
            continue
        for per, signs in enumerate(compare(*args)):
            for j, v in enumerate("ykci"):
                got[per][v].add(signs[j])
    cell = lambda st: (list(st)[0] if len(st) == 1 else "?")
    return "".join(cell(got[0][v]) for v in "ykci") + "".join(cell(got[1][v]) for v in "ykci")

# (название, свободные параметры, как собрать состояние, ожидаемая строка «итого»)
CASES = [
    ("Задача 1  K ×0,80 и L ×1,25",
     {"s":S_FULL, "d":FULL, "a":FULL},
     lambda p: (p["s"], p["d"], p["a"], p["s"], p["d"], p["a"], 0.8/1.25), 41,
     "↓↓↓↓===="),
    ("Задача 2  s 0,10→0,20 и δ 0,10→0,12",
     {"a":FULL},
     lambda p: (0.10, 0.10, p["a"], 0.20, 0.12, p["a"], 1.0), 981,
     "==↓↑↑↑?↑"),
    # g входит в модель только через δ+n+g, поэтому рост g с 0 до 0,05 —
    # это та же прибавка к выбытию, что и рост δ на 5 пунктов
    ("Задача 3  K ×1,10 и g +5 п.п.",
     {"s":S_FULL, "d":FULL, "a":FULL},
     lambda p: (p["s"], p["d"], p["a"], p["s"], p["d"]+0.05, p["a"], 1.10), 41,
     "↑↑↑↑↓↓↓↓"),
    ("Задача 4  s 0,20→0,22 и α 0,30→0,35",
     {"d":FULL},
     lambda p: (0.20, p["d"], 0.30, 0.22, p["d"], 0.35, 1.0), 981,
     "?=??????"),
    # n входит в модель только через δ+n+g, поэтому рост n с 0 до 0,02 —
    # это выбытие 0,05 → 0,07 при неизменной δ
    ("Задача 5  n 0→0,02 и α 0,40→0,35",
     {"s":S_FULL},
     lambda p: (p["s"], 0.05, 0.40, p["s"], 0.07, 0.35, 1.0), 981,
     "?=??????"),
]

if __name__ == "__main__":
    bad = 0
    print("       краткосрочно    долгосрочно")
    print("       y k c i        y k c i")
    for name, free, build, n, want in CASES:
        got = solve(free, build, n)
        ok = got == want
        bad += not ok
        print("%-8s %s   %s   %s" % (
            "OK" if ok else "РАСХОД", " ".join(got[:4]), " ".join(got[4:]), name))
        if not ok:
            print("         ожидалось: %s   %s" % (" ".join(want[:4]), " ".join(want[4:])))
    print()
    print("Строка «итого» — все шоки задачи вместе. Сверьте с нижней строкой",
          "таблицы в index.html.")
    raise SystemExit(1 if bad else 0)

/* Траектории во времени против таблицы
 *
 * Запуск: node check/ui-paths.js   (нужен playwright и python3 -m http.server 8000)
 * Браузер — CHROME_PATH, адрес — URL. Проще всего: bash check/all.sh
 */
let chromium;
try { chromium = require('playwright-core').chromium; }
catch (e) {
  try { chromium = require('playwright').chromium; }
  catch (e2) {
    console.error('Нужен playwright: npm i -D playwright-core (или playwright).');
    process.exit(2);
  }
}
const EXE = process.env.CHROME_PATH || undefined;
const BASE = process.env.URL || 'http://localhost:8000/';
let PROBN = 0;                       // сколько задач на странице — узнаём у неё самой
const R = []; const ok = (n,c,x) => R.push([c?'PASS':'FAIL', n, x===undefined?'':JSON.stringify(x)]);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await b.newContext({viewport:{width:1600,height:1300}})).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (f,a) => p.evaluate(f,a);
  const load = async i => { await ev(i=>document.querySelector('[data-p="'+i+'"]').click(), i);
                            await p.waitForTimeout(700); };
  await p.goto(BASE, {waitUntil:'networkidle'});
  await p.waitForTimeout(600);
  PROBN = await p.evaluate(()=>PROBLEMS.length);

  ok('без шоков блок траекторий скрыт', await ev(()=>document.getElementById('pathsblock').hidden));

  for (let i = 0; i < PROBN; i++){
    await load(i);
    const r = await ev(()=>{
      const d = pathData(); if (!d) return null;
      const pv = dispVals(), PF = finalP(pv), kN = kStar(PF);
      const last = d.pts[d.pts.length - 1].v, first = d.pts[0].v;
      const base = d.base0;
      const sg = x => Math.abs(x) < 2e-3 ? '=' : (x > 0 ? '↑' : '↓');
      return {
        title: PROBLEMS[probIdx].title,
        /* куда пришла траектория против честного стационара */
        kEnd: last.k, kStarNew: kN,
        /* знаки в начале и в конце — против таблицы */
        sr: ['y','k','c','i'].map(v => sg(first[v]/base[v] - 1)).join(''),
        /* знаки длинного периода берём у настоящего стационара: у траектории
           конечный горизонт, и последняя точка не доходит до него доли процента */
        lr: ['y','k','c','i'].map(v => sg(d.endAt[v]/base[v] - 1)).join(''),
        tail: last.k / kN - 1,
        tbl: (()=>{ const rows = sweepCached(); const r = rows[rows.length-1];
          const m = {up:'↑', down:'↓', same:'=', dunno:'?'};
          return {sr: r.sr.map(x=>m[x]).join(''), lr: r.lr.map(x=>m[x]).join('')}; })()
      };
    });
    ok(r.title + ': траектория доходит до стационара (недобор < 1%)',
       Math.abs(r.tail) < 0.01, {недобор: +(r.tail*100).toFixed(3) + '%',
                                 конец: +r.kEnd.toFixed(4), стационар: +r.kStarNew.toFixed(4)});
    const fits = (path, tbl) => [...tbl].every((c, j) => c === '?' || c === path[j]);
    ok(r.title + ': краткосрочные знаки совпадают с таблицей',
       fits(r.sr, r.tbl.sr), {путь:r.sr, таблица:r.tbl.sr});
    ok(r.title + ': долгосрочные знаки совпадают с таблицей',
       fits(r.lr, r.tbl.lr), {путь:r.lr, таблица:r.tbl.lr});
  }

  /* Горизонт считается от скорости сходимости, а она мала при α, близкой
     к единице. Раньше горизонт обрезался пятьюстами единицами времени, и путь
     не доходил до стационара вовсе: пунктир «new» оказывался за полем. */
  for (const [name, a, sh] of [['α = 0,95', 0.95, ['s','mul',1.8]],
                               ['α = 0,99', 0.99, ['d','add',0.01]],
                               ['α = 0,05', 0.05, ['s','mul',2]]]){
    const r = await ev(({a, sh}) => {
      PKEYS.forEach(k => { const v = k === 'a' ? a : DEFAULT_BASE[k].v;
        base[k] = {v: clampKey(k, v), fixed: true, def: clampKey(k, v)}; });
      shocks = [{key: sh[0], form: sh[1], value: clampKey(sh[0], sh[2], sh[1]), on: true, ci: 0}];
      revealed = true; refreshAll();
      const d = pathData(); if (!d) return null;
      const last = d.pts[d.pts.length - 1].v.k, kN = kStar(finalP(dispVals()));
      return {rel: last / kN, pts: d.pts.length};
    }, {a, sh});
    ok('при ' + name + ' путь доходит до нового стационара',
       r && Math.abs(r.rel - 1) < 0.05 && r.pts < 3000, r);
  }

  /* уровень сразу после шоков подписан там же, где на большой диаграмме */
  await load(2);                                   // L ×0,90 и δ +5 п.п.: скачок есть
  ok('на траектории есть уровень «скачок», когда он отличается от old и new',
     await ev(()=>{
       const d = pathData();
       const rel = (v,k) => v / d.base0[k];
       return ['y','k','c','i'].some(k => {
         const j = rel(d.pts[0].v[k], k), e = rel(d.endAt[k], k);
         return Math.abs(j-1) > 1e-9 && Math.abs(j-e) > 1e-9;
       });
     }));
  await load(1);                                   // s и δ: запас не скачет, y и k без скачка
  ok('а где скачка нет — и подписи нет', await ev(()=>{
       const d = pathData(), rel = (v,k) => v / d.base0[k];
       return ['y','k'].every(k => Math.abs(rel(d.pts[0].v[k], k) - 1) < 1e-9);
     }));

  ok('ошибок на странице нет', errs.length === 0, errs);
  await b.close();
  const fails = R.filter(x=>x[0]==='FAIL');
  R.forEach(x=>console.log(x[0].padEnd(5), x[1], x[2] ? '  '+x[2].slice(0,110) : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

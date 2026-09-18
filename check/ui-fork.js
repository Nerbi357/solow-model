/* Развилка: стороны, вырожденные картинки, зум у каждой диаграммы
 *
 * Набор написан после того, как две поломки подряд прошли мимо всех
 * остальных: ветка «k < 1» отвечала «нельзя определить» из-за точки ровно
 * на границе, а представитель случая брался с s = 0,99, при которой f(k)
 * и s·f(k) сливаются в одну линию. Ни один прежний набор про это не знал:
 * все они утверждали либо «ответ такой», либо «ничего не сломалось».
 * Здесь утверждается то, что развилка обещает.
 *
 * Запуск: node check/ui-fork.js   (нужен playwright и python3 -m http.server 8000)
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
const R = []; const ok = (n, c, x) => R.push([c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)]);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await b.newContext({viewport:{width:1600,height:1250}})).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const ev = (fn, a) => p.evaluate(fn, a);
  await p.goto(BASE, { waitUntil: 'networkidle' });

  /* ---------- 1. граница k = 1 не принадлежит ни одной ветке ---------- */
  /* Перебор идёт по равномерной сетке, а у s и δ в META одинаковые границы:
     вся диагональ s = δ при n = g = 0 ложится на узлы точно. На непрерывном
     множестве такая точка не встретилась бы никогда. */
  ok('точка ровно на границе не достаётся ни одной стороне', await ev(() => {
    const q = {s:0.5, d:0.5, n:0, g:0, a:1/3};
    return sideOf(q) === null && sideOf({...q, s:0.6}) === true && sideOf({...q, s:0.4}) === false;
  }));
  ok('узлы сетки на диагонали s = δ тоже отброшены', await ev(() => {
    const m = META.s, out = [];
    for (let j = 0; j < 13; j++){
      const v = m.min + (m.max - m.min) * j / 12;
      out.push(sideOf({s:v, d:v, n:0, g:0, a:0.3}));
    }
    return out.every(x => x === null);
  }));

  /* ---------- 2. один шок по α: внутри ветки нет «нельзя определить» ---------- */
  /* Знак каждой клетки при единственном шоке по α решает только сторона
     от k = 1: k краткосрочно не двигается, y = k^α меняется по стороне,
     c и i — вместе с y, потому что s не тронута. Значит внутри своего
     случая неопределённости быть не может. Ровно это и сломалось. */
  const KEYS = ['s','d','n','g','a'];
  const cases = [];
  for (let mask = 1; mask < 32; mask++){
    const free = KEYS.filter((_, i) => mask & (1 << i));
    for (const sh of [{form:'add', value:0.3}, {form:'mul', value:0.5}, {form:'set', value:0.55}])
      cases.push({free, sh});
  }
  const bad = await ev(cs => {
    const out = [];
    cs.forEach(c => {
      PKEYS.forEach(k => { base[k] = {v: DEFAULT_BASE[k].v, fixed: c.free.indexOf(k) < 0,
                                      def: DEFAULT_BASE[k].v}; });
      shocks = [{key:'a', form:c.sh.form, value:c.sh.value, on:true, ci:0}];
      enforceLocks(); clampShocks();
      const fk = forkCase();
      if (!fk) return;
      fk.cases.forEach(cc => {
        const rows = caseSweep(cc.lim);
        if (!rows || !rows.length){ out.push({...c, случай:cc.text, беда:'ветка пуста'}); return; }
        const last = rows[rows.length - 1];
        const dunno = last.sr.concat(last.lr).filter(x => x === 'dunno').length;
        if (dunno) out.push({free:c.free.join(''), форма:c.sh.form, случай:cc.text, dunno});
      });
    });
    return out;
  }, cases);
  ok('один шок по α — внутри каждой ветки всё определено', bad.length === 0,
     {проверено: cases.length, беды: bad.slice(0, 4)});

  /* обе ветки обязаны найтись, когда сторона действительно свободна */
  const forks = await ev(cs => {
    let two = 0, none = 0;
    cs.forEach(c => {
      PKEYS.forEach(k => { base[k] = {v: DEFAULT_BASE[k].v, fixed: c.free.indexOf(k) < 0,
                                      def: DEFAULT_BASE[k].v}; });
      shocks = [{key:'a', form:c.sh.form, value:c.sh.value, on:true, ci:0}];
      enforceLocks(); clampShocks();
      forkCase() ? two++ : none++;
    });
    return {two, none};
  }, cases);
  ok('развилка находится, когда сторону не задаёт условие', forks.two > 0, forks);

  /* ---------- 3. одноцветные кривые не сливаются молча ---------- */
  /* Две линии одного цвета в паре пикселей друг от друга читаются как одна
     линия с зазором внутри. Либо они разведены, либо страница про это
     сказала словами — третьего быть не должно. */
  const MEAS = `(() => {
    const rec = [];
    const orig = curve;
    window.curve = function(ctx, fn, k0, k1, X, Y, color, w){
      const pts = [];
      for (let i = 0; i <= 60; i++){ const k = k0 + (k1-k0)*i/60; pts.push(Y(fn(k))); }
      rec.push({color, canvas: ctx.canvas.id, pts});
      return orig.apply(this, arguments);
    };
    drawMain();
    window.curve = orig;
    const by = {};
    rec.forEach(r => { (by[r.canvas] = by[r.canvas] || []).push(r); });
    const vis = e => !!e && !!e.offsetParent;
    return Object.keys(by).map(id => {
      const rs = by[id]; let mn = Infinity;
      for (let i = 0; i < rs.length; i++) for (let j = i+1; j < rs.length; j++){
        if (rs[i].color !== rs[j].color) continue;
        let mx = 0;
        for (let t = 0; t < rs[i].pts.length; t++){
          const a = rs[i].pts[t], c = rs[j].pts[t];
          if (isFinite(a) && isFinite(c)) mx = Math.max(mx, Math.abs(a-c));
        }
        mn = Math.min(mn, mx);
      }
      return {id, разлёт: +mn.toFixed(1),
              сказано: vis(document.getElementById(id === 'main' ? 'tight1' : 'tight2'))};
    });
  })()`;
  const shot = async pre => { if (pre) await ev(pre); await p.waitForTimeout(420); return ev(MEAS); };

  const scenes = [
    ['чистая, α → 0,55', `shocks=[{key:'a',form:'set',value:0.55,on:true,ci:0}];refreshAll()`],
    ['чистая, α + 0,3',  `shocks=[{key:'a',form:'add',value:0.3,on:true,ci:0}];refreshAll()`],
    ['чистая, α × 0,5',  `shocks=[{key:'a',form:'mul',value:0.5,on:true,ci:0}];refreshAll()`],
    ['s задана 0,99',    `base.s={v:0.99,fixed:true,def:0.5};shocks=[{key:'a',form:'set',value:0.6,on:true,ci:0}];refreshAll()`],
    ['s задана 0,02',    `base.s={v:0.02,fixed:true,def:0.5};shocks=[{key:'a',form:'set',value:0.6,on:true,ci:0}];refreshAll()`],
    ['шок по s без α',   `base.s={v:0.5,fixed:false,def:0.5};shocks=[{key:'s',form:'set',value:0.7,on:true,ci:0}];refreshAll()`]
  ];
  const glued = [];
  for (const [name, pre] of scenes){
    const m = await shot(pre);
    m.forEach(x => { if (x.разлёт < 16 && !x.сказано) glued.push({сцена:name, ...x}); });
  }
  await ev(`probIdx=-1;location.hash='';location.reload&&0`);
  await p.goto(BASE, { waitUntil: 'networkidle' });
  const PN = await ev(() => document.querySelectorAll('[data-p]').length);
  for (let i = 0; i < PN; i++){
    await ev(i => document.querySelector('[data-p="'+i+'"]').click(), i);
    const m = await shot();
    m.forEach(x => { if (x.разлёт < 16 && !x.сказано) glued.push({сцена:'задача '+(i+1), ...x}); });
  }
  ok('слипшиеся линии либо разведены, либо названы словами', glued.length === 0, glued.slice(0, 4));

  /* заметка не висит там, где линии разошлись */
  await p.goto(BASE, { waitUntil: 'networkidle' });
  const lies = [];
  for (const [name, pre] of scenes){
    const m = await shot(pre);
    m.forEach(x => { if (x.разлёт >= 16 && x.сказано) lies.push({сцена:name, ...x}); });
  }
  ok('заметки нет там, где линии и так разведены', lies.length === 0, lies.slice(0, 4));

  /* ---------- 3a. куда уехал стационар на картинке ---------- */
  /* Две диаграммы рисуются ради того, чтобы стало видно: ответ в случаях
     разный. Значит нарисованный сдвиг стационара обязан сходиться с тем,
     что отвечает про него ветка: разные знаки в ветках — стационары
     на картинках в разные стороны, одинаковые — в одну. Односторонняя
     картинка при разных ответах читается как «какая разница», а сдвиг
     против ответа своей ветки — прямая ложь. */
  await p.goto(BASE, { waitUntil: 'networkidle' });
  const dirs = await ev(cs => {
    const out = [];
    cs.forEach(c => {
      PKEYS.forEach(k => { base[k] = {v: DEFAULT_BASE[k].v, fixed: c.free.indexOf(k) < 0,
                                      def: DEFAULT_BASE[k].v}; });
      shocks = [{key:'a', form:c.sh.form, value:c.sh.value, on:true, ci:0}];
      enforceLocks(); clampShocks();
      const fk = forkCase();
      if (!fk) return;
      const got = fk.cases.map(cc => {
        const k0 = kStar(cc.vals), kN = kStar(finalP(cc.vals));
        const rows = caseSweep(cc.lim), last = rows[rows.length - 1];
        return {рисует: Math.abs(Math.log(kN / k0)) < 1e-9 ? 'flat' : kN > k0 ? 'up' : 'down',
                отвечает: last.lr[1]};          // долгосрочный k
      });
      const [a, b] = got;
      if (a.отвечает !== 'dunno' && a.рисует !== 'flat' &&
          ((a.отвечает === 'up') !== (a.рисует === 'up')))
        out.push({free:c.free.join(''), форма:c.sh.form, беда:'верхняя рисует против своего ответа', got});
      if (b.отвечает !== 'dunno' && b.рисует !== 'flat' &&
          ((b.отвечает === 'up') !== (b.рисует === 'up')))
        out.push({free:c.free.join(''), форма:c.sh.form, беда:'нижняя рисует против своего ответа', got});
      if (a.отвечает !== 'dunno' && b.отвечает !== 'dunno' &&
          a.отвечает !== b.отвечает && a.рисует === b.рисует)
        out.push({free:c.free.join(''), форма:c.sh.form, беда:'ответы разные, а стационары в одну сторону', got});
    });
    return out;
  }, cases);
  ok('нарисованный сдвиг стационара сходится с ответом ветки', dirs.length === 0,
     {проверено: cases.length, беды: dirs.slice(0, 4)});

  /* ---------- 4. зум у каждой диаграммы свой ---------- */
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await ev(`shocks=[{key:'a',form:'set',value:0.55,on:true,ci:0}];refreshAll()`);
  await p.waitForTimeout(500);
  ok('на развилке две диаграммы', await ev(() => !!forkCase() && !document.getElementById('fork2').hidden));

  const box2 = await p.locator('#main2').boundingBox();
  await p.mouse.move(box2.x + box2.width * 0.4, box2.y + box2.height * 0.6);
  for (let i = 0; i < 4; i++) await p.mouse.wheel(0, -120);
  await p.waitForTimeout(300);
  ok('колесо по нижней приближает нижнюю и только её',
     await ev(() => !!PANE.main2.view && PANE.main.view === null &&
                    PANE.main2.view.k1 - PANE.main2.view.k0 < PANE.main2.auto.k1 - PANE.main2.auto.k0),
     await ev(() => ({низ: PANE.main2.view, верх: PANE.main.view})));
  ok('кнопка сброса появилась', await ev(() => !document.getElementById('zoomreset').hidden));

  const k0was = await ev(() => PANE.main2.view.k0);
  await p.mouse.move(box2.x + box2.width * 0.5, box2.y + box2.height * 0.5);
  await p.mouse.down();
  await p.mouse.move(box2.x + box2.width * 0.5 - 70, box2.y + box2.height * 0.5, {steps: 6});
  await p.mouse.up();
  await p.waitForTimeout(250);
  ok('перетаскивание сдвигает нижнюю', await ev(v => PANE.main2.view.k0 !== v, k0was) &&
     await ev(() => PANE.main.view === null));

  const box1 = await p.locator('#main').boundingBox();
  await p.mouse.move(box1.x + box1.width * 0.5, box1.y + box1.height * 0.5);
  for (let i = 0; i < 3; i++) await p.mouse.wheel(0, -120);
  await p.waitForTimeout(300);
  ok('верхняя приближается независимо', await ev(() => !!PANE.main.view && !!PANE.main2.view));

  await p.dblclick('#main2'); await p.waitForTimeout(250);
  ok('двойной щелчок сбрасывает только свою', await ev(() => PANE.main2.view === null && !!PANE.main.view));
  await ev(() => document.getElementById('zoomreset').click());
  await p.waitForTimeout(250);
  ok('кнопка сбрасывает обе', await ev(() => PANE.main.view === null && PANE.main2.view === null &&
                                             document.getElementById('zoomreset').hidden));

  /* ---------- 5. координаты считаются по своей калибровке ---------- */
  /* Раньше renderCoords звал pointList() без VOVR — то есть считал
     по иллюстративной калибровке, картинке, которой на экране нет вовсе. */
  const co = await ev(() => {
    const out = {};
    ['main', 'main2'].forEach((id, i) => {
      /* не исходная точка: координаты относительные, и у old они (1; 1)
         в обоих случаях по построению */
      const h = PANE[id].hits[PANE[id].hits.length - 1];
      pickPane = id; picked = [h && h.id].filter(Boolean);
      renderCoords();
      const t = document.querySelector('#coords-body .ccase');
      const cells = [...document.querySelectorAll('#coords-body tbody td')].map(td => td.textContent);
      out[id] = {случай: t && t.textContent, точек: PANE[id].hits.length, ячейки: cells.slice(0, 3)};
    });
    picked = []; pickPane = 'main'; renderCoords();
    return out;
  });
  ok('обе диаграммы отдают точки', co.main.точек > 0 && co.main2.точек > 0,
     {верх: co.main.точек, низ: co.main2.точек});
  ok('таблица координат называет случай',
     /k < 1/.test(co.main.случай || '') && /k > 1/.test(co.main2.случай || ''), co);
  ok('числа у случаев разные', JSON.stringify(co.main.ячейки) !== JSON.stringify(co.main2.ячейки), co);

  /* Кружок подсвечивается только на своей диаграмме: рядом с ним стоят
     координаты, а у той же точки в другом случае они другие. */
  const own = await ev(() => {
    /* считаем чернила: отмеченная точка — залитый кружок побольше,
       две пунктирные направляющие и подпись координат */
    const filled = () => ['main','main2'].map(id => {
      const cv = document.getElementById(id), g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let c = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i+3] > 200 && (d[i] < 235 || d[i+1] < 235 || d[i+2] < 235)) c++;
      return c;
    });
    const base = filled();
    pickPane = 'main2'; picked = [PANE.main2.hits[PANE.main2.hits.length-1].id];
    drawMain();
    const after = filled();
    picked = []; pickPane = 'main'; drawMain();
    return {верхБыло: base[0], верхСтало: after[0], низБыло: base[1], низСтало: after[1]};
  });
  ok('отметка красит только свою диаграмму',
     own.верхСтало === own.верхБыло && own.низСтало > own.низБыло, own);

  /* ---------- 6. края диапазонов ---------- */
  /* Равномерная сетка садится на вырожденные множества точно, а не почти
     никогда: край диапазона обязан быть именованным случаем, а не надеждой
     на случайное блуждание. */
  const edges = await ev(() => {
    const out = [];
    const txt = () => document.body.innerText;
    PKEYS.forEach(k => {
      [META[k].min, META[k].max].forEach(v => {
        [{key:'a',form:'mul',value:0.5}, {key:'s',form:'add',value:0.1},
         {key:'K',form:'mul',value:0.8}].forEach(sh => {
          PKEYS.forEach(q => { base[q] = {v: DEFAULT_BASE[q].v, fixed:false, def: DEFAULT_BASE[q].v}; });
          base[k] = {v, fixed:true, def:v};
          shocks = [{key:sh.key, form:sh.form, value:sh.value, on:true, ci:0}];
          try {
            enforceLocks(); clampShocks(); refreshAll();
          } catch (e){ out.push({k, v, шок:sh.key, беда:'исключение: ' + e.message}); return; }
          const s = txt();
          if (/NaN|undefined|Infinity/.test(s)) out.push({k, v, шок:sh.key, беда:'NaN на странице'});
          const bad = [...document.querySelectorAll('canvas')].some(c => !c.width || !c.height);
          if (bad) out.push({k, v, шок:sh.key, беда:'канвас нулевого размера'});
          if (!isFinite(PANE.main.auto.k1) || PANE.main.auto.k1 <= 0)
            out.push({k, v, шок:sh.key, беда:'рамка не число'});
        });
      });
    });
    return out;
  });
  ok('края диапазонов ничего не ломают', edges.length === 0, {беды: edges.slice(0, 5)});

  ok('ошибок в консоли нет', errs.length === 0, errs.slice(0, 3));
  await b.close();
  const fails = R.filter(r => r[0] === 'FAIL');
  R.forEach(r => console.log(r[0].padEnd(5), r[1], r[2] ? '  ' + r[2].slice(0, 220) : ''));
  console.log('\n' + (R.length - fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

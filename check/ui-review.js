/* Регрессии по находкам агентной проверки (review/REPORT.md)
 *
 * Каждая проверка названа номером находки и обязана падать на странице
 * до исправления: так проверялось при написании, на замороженной копии.
 * Запуск: node check/ui-review.js   (нужен playwright и python3 -m http.server 8000)
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
const R = []; const ok = (n,c,x) => R.push([c?'PASS':'FAIL', n, x===undefined?'':JSON.stringify(x)]);

/* Подложки подписей tagSub: белые 0,9 и высотой 13 × 1,5 = 19,5 px. Перехват
   ставится до загрузки, чтобы попали все отрисовки. */
const PADS = () => {
  window.__pads = [];
  const fr = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h){
    if (String(this.fillStyle).replace(/\s/g,'') === 'rgba(255,255,255,0.9)' && Math.abs(h - 19.5) < 0.01)
      window.__pads.push({cv: this.canvas.id, x, y, w, h});
    return fr.apply(this, arguments);
  };
};
const overlaps = pads => {
  const bad = [];
  for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++){
    const a = pads[i], b = pads[j];
    if (a.cv !== b.cv) continue;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 0.5 && oy > 0.5) bad.push(a.cv + ' ' + oy.toFixed(1) + 'px');
  }
  return bad;
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const lap = await b.newContext({viewport:{width:1366,height:768}});
  await lap.addInitScript(PADS);
  const p = await lap.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (f,a) => p.evaluate(f,a);
  const go = async h => { await p.goto(BASE + h, {waitUntil:'networkidle'}); await p.waitForTimeout(700); };
  const reveal = async () => { await ev(()=>{const r=document.getElementById('reveal'); if (r && !r.disabled) r.click();});
                               await p.waitForTimeout(600); };

  // ---- K1: живое обновление карточки шока = полная пересборка ----
  await go('');
  await ev(()=>document.querySelector('[data-pin="d"]').click()); await p.waitForTimeout(250);
  await ev(()=>{document.getElementById('addsel').value='d'; document.getElementById('add').click();});
  await p.waitForTimeout(350);
  await ev(()=>{const e=document.getElementById('nk0-d'); e.value='0,2'; e.dispatchEvent(new Event('change',{bubbles:true}));});
  await p.waitForTimeout(500);
  const live = await ev(()=>document.querySelector('[data-card="0"] .touch').innerHTML);
  await ev(()=>refreshAll()); await p.waitForTimeout(300);
  const full = await ev(()=>document.querySelector('[data-card="0"] .touch').innerHTML);
  ok('K1: пояснение карточки после ввода то же, что после полной пересборки', live === full, {live, full});

  // ---- K4, A7-01: текст над развилкой ----
  await go('#b=s:0.2:0,d:0.05:1,n:0:1,g:0:1,a:0.4:1&k=n:set:0.02:1;a:set:0.35:1');
  const lead5 = await ev(()=>document.getElementById('forklead').textContent);
  ok('K4: α падает — текст говорит о падении α', /падение α/i.test(lead5) && !/рост α/i.test(lead5), lead5.slice(60, 170));
  await go('#b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1');
  ok('K4: α растёт — текст говорит о росте α', /рост α/i.test(await ev(()=>document.getElementById('forklead').textContent)));
  await go('#b=s:0.5:0,d:0.1:0,n:0:0,g:0:0,a:0.3:0&k=a:set:0.6:1');
  const leadAll = await ev(()=>document.getElementById('forklead').textContent);
  ok('A7-01: названы все свободные из s, δ, n, g, а не первый', /s, δ, n и g/.test(leadAll), leadAll.slice(150, 260));

  // ---- K10, A6-01: совпавшие линии разных шоков названы словами ----
  const same = () => ev(()=>{const e=document.getElementById('same1'); return !!e && !e.hidden ? e.textContent : null;});
  await go('#b=s:0.3:1,d:0.05:1,n:0:0,g:0:0,a:0.5:1&k=n:add:0.4:1;g:add:0.4:1');
  const s8 = await same();
  ok('K10: T8 — заметка о совпавших линиях n и g', !!s8 && /n \+/.test(s8) && /g \+/.test(s8), s8);
  await go('#b=s:0.3:1,d:0.06:1,n:0.01:1,g:0.02:1,a:0.4:1&k=n:add:0.03:1;g:add:0.03:1');
  ok('A6-01: то же при заданных n и g', !!(await same()));
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.5:1&k=s:mul:2:1;d:mul:2:1');
  ok('A6-01: разные линии — заметки нет', (await same()) === null);

  // ---- A8-02, A2-03, A1-05: траектория доходит до стационара ----
  for (const [nm, h] of [['α 0,5 → 0,95', '#b=s:0.3:1,d:0.05:1,n:0:1,g:0:1,a:0.5:1&k=a:set:0.95:1'],
                         ['α ×2 до 0,99', '#b=s:0.3:1,d:0.1:1,n:0:1,g:0:1,a:0.6:1&k=a:mul:2:1'],
                         ['α → 0,99 и s в разы', '#b=s:0.3:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=d:add:-0.09:1;s:add:0.69:1;a:set:0.99:1']]){
    await go(h);
    const gap = await ev(()=>{const d=pathData(); const l=d.pts[d.pts.length-1].v;
      return Math.max(...['y','k','c','i'].map(v=>Math.abs(l[v]/d.endAt[v]-1)));});
    ok('A8-02: ' + nm + ' — путь приходит в new (недолёт < 1%)', gap < 0.01, +(gap*100).toFixed(2) + '%');
  }

  // ---- A8-01, A6-03: подписи уровней не наезжают ----
  for (const [nm, h] of [['траектории при α → 0,95', '#b=s:0.3:1,d:0.05:1,n:0:1,g:0:1,a:0.5:1&k=a:set:0.95:1'],
                         ['задача 5, ось y', '#b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1'],
                         ['близкие y_old и y_new', '#b=s:0.25:1,d:0.08:1,n:0:1,g:0:1,a:0.35:1&k=s:add:0.001:1;d:add:0.0005:1;K:mul:1.01:1']]){
    await go(h); await reveal();
    await ev(()=>{window.__pads = []; drawMain(); if (typeof drawPaths === 'function') drawPaths();});
    await p.waitForTimeout(300);
    const pads = await ev(()=>window.__pads);
    const bad = overlaps(pads);
    ok('A8-01/A6-03: ' + nm + ' — подложки подписей не пересекаются', pads.length > 0 && bad.length === 0, {подписей: pads.length, bad});
  }

  // ---- A1-03, A1-04: ветка развилки видит смену знака внутри себя ----
  for (const [nm, h, ci, per] of [['A1-03: три свободных, ветка k > 1, кратко y', '#b=s:0.15:1,d:0.05:0,n:0:0,g:0:0,a:0.4:1&k=a:set:0.2:1;L:mul:0.8:1', 1, 'sr'],
                                  ['A1-04: тонкая полоса у k = 1, ветка k < 1, кратко y', '#b=s:0.3:1,d:0.1:0,n:0.01:0,g:0.1:0,a:0.97:1&k=L:mul:2:1;a:set:0.4:1', 0, 'sr']]){
    await go(h);
    const y = await ev(([ci, per])=>{const fk=forkCase(); const rows=caseSweep(fk.cases[ci].lim); return rows[rows.length-1][per][0];}, [ci, per]);
    ok(nm + ' — «?», а не уверенная стрелка', y === 'dunno', y);
  }

  // ---- B3-01, B1-04: ячейка не принимает мусор, Escape отменяет ----
  await go('#b=s:0.5:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1');
  const box = p.locator('#nb-s');
  for (const v of ['0,0,1', '5бла']){
    await box.fill(v); await box.press('Tab'); await p.waitForTimeout(300);
    ok('B3-01: «' + v + '» не становится значением', (await ev(()=>base.s.v)) === 0.5, await ev(()=>base.s.v));
  }
  await box.click(); await box.fill('0,777'); await box.press('Escape'); await p.waitForTimeout(200);
  await p.mouse.click(700, 40); await p.waitForTimeout(300);
  ok('B1-04: Escape отменяет набранное', (await ev(()=>base.s.v)) === 0.5 && (await box.inputValue()) === '0,500',
     {s: await ev(()=>base.s.v), ячейка: await box.inputValue()});

  // ---- A2-01: подпись единиц под таблицей знает про g до шоков ----
  const units = async h => { await go(h); return ev(()=>document.getElementById('fxunits').textContent); };
  const u1 = await units('#b=s:0.2:1,d:0.05:1,n:0.01:1,g:0.02:1,a:0.3:1&k=g:set:0:1');
  ok('A2-01: g 0,02 → 0 — величины на единицу эффективного труда, а не подушевые', /эффективного труда/.test(u1), u1);
  const u2 = await units('#b=s:0.2:1,d:0.05:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.3:1');
  ok('A2-01: g = 0 задана — подушевые', /подушев/.test(u2) && !/эффективного/.test(u2), u2);

  // ---- W3-01: полоса у самой границы k = 1 при высокой α ----
  /* Независимый расчёт по формулам модели, без страницы: в ветке k < 1 при
     n = 0,0025 выпуск падает, при n = 0,05 растёт — значит ответ ветки «?». */
  const yStar = (s, d, a) => Math.pow(s / d, a / (1 - a));
  const w1 = [0.0025, 0.05].map(n => Math.sign(yStar(0.1, 0.098 + n + 0.02, 0.35) - yStar(0.1, 0.098 + n, 0.9)));
  ok('W3-01: сама полоса существует (y падает и растёт внутри ветки k < 1)', w1[0] < 0 && w1[1] > 0, w1);
  for (const [nm, h, ci, per, col] of [
      ['W3-01: n и g свободны, α = 0,9, ветка k < 1, долго y', '#b=s:0.1:1,d:0.098:1,n:0:0,g:0:0,a:0.9:1&k=a:set:0.35:1;g:add:0.02:1', 0, 'lr', 0],
      ['W3-01: s, n и α свободны, ветка k > 1, долго c', '#b=s:0.148:0,d:0.129:1,n:0:0,g:0:1,a:0.678:0&k=a:set:0.173:1;s:add:0.01:1', 1, 'lr', 2]]){
    await go(h);
    const v = await ev(([ci, per, col])=>{const fk=forkCase(); const rows=caseSweep(fk.cases[ci].lim); return rows[rows.length-1][per][col];}, [ci, per, col]);
    ok(nm + ' — «?», а не уверенная стрелка', v === 'dunno', v);
  }

  // ---- W3-02: подсказка про клавиатуру остаётся в имени диаграммы ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.3:1');
  const al1 = await ev(()=>document.getElementById('main').getAttribute('aria-label'));
  ok('W3-02: у диаграммы без развилки в имени есть подсказка про клавиатуру', /С клавиатуры/.test(al1), al1);
  await go('#b=s:0.2:0,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=a:set:0.6:1');
  const al2 = await ev(()=>['main','main2'].map(id=>document.getElementById(id).getAttribute('aria-label')));
  ok('W3-02: на развилке — у обеих диаграмм', al2.every(a => /С клавиатуры/.test(a)), al2);

  // ---- W3-03: отказ принять число виден — ячейка краснеет и держит набранное ----
  await go('#b=s:0.5:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1');
  const bx = p.locator('#nb-s');
  const cell = () => ev(()=>{const e=document.getElementById('nb-s');
    return {bad: e.classList.contains('bad'), val: e.value, s: base.s.v, inv: e.getAttribute('aria-invalid')};});
  await bx.click(); await bx.fill('10%'); await bx.press('Enter');
  await ev(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const c1 = await cell();
  ok('W3-03: «10%» + Enter — ячейка красная, набранное на месте, значение прежнее',
     c1.bad && c1.val === '10%' && c1.s === 0.5 && c1.inv === 'true', c1);
  await p.mouse.click(700, 40); await p.waitForTimeout(250);
  const c2 = await cell();
  ok('W3-03: и после ухода с ячейки отказ виден', c2.bad && c2.val === '10%' && c2.s === 0.5, c2);
  await bx.click(); await bx.press('Escape'); await p.waitForTimeout(200);
  const c3 = await cell();
  ok('W3-03: Escape возвращает прежнее число и снимает подсветку', !c3.bad && c3.val === '0,500' && c3.inv === null, c3);

  // ---- W3-04, W3-05: почти совпавшие линии; три совпавшие — одной фразой ----
  await go('#b=s:0.3:1,d:0.05:1,n:0:1,g:0:1,a:0.5:1&k=n:add:0.4:1;g:add:0.401:1');
  const s4 = await same();
  ok('W3-04: n + 0,400 и g + 0,401 расходятся меньше чем на пиксель — заметка есть', !!s4 && /почти/.test(s4), s4);
  await go('#b=s:0.3:1,d:0.05:1,n:0:1,g:0:1,a:0.5:1&k=n:add:0.1:1;g:add:0.1:1;d:add:0.1:1');
  const s5 = await same();
  ok('W3-05: три одинаковые линии — одна фраза, и видна последняя', !!s5 && (s5.match(/дают/g) || []).length === 1 &&
     /видна только линия шока «δ/.test(s5) && /остальные/.test(s5), s5);
  for (let i = 0; i < await ev(()=>PROBLEMS.length); i++){
    await ev(i=>document.querySelector('[data-p="' + i + '"]').click(), i); await p.waitForTimeout(500);
    ok('W3-04: в задаче ' + (i + 1) + ' заметки о совпавших линиях нет', (await ev(()=>['same1','same2'].every(id=>{const e=document.getElementById(id); return !e || e.hidden;}))));
  }

  // ---- W3-08: ползунок шока называется не так, как исходный ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:add:0.05:1');
  const nm8 = await ev(()=>['b-s','k0-s','nb-s','nk0-s'].map(id=>document.getElementById(id).getAttribute('aria-label')));
  ok('W3-08: у исходного s и шока по s разные имена', nm8[0] !== nm8[1] && nm8[2] !== nm8[3] && /Шок по s/.test(nm8[1]), nm8);

  // ---- телефон: B2-01 (касание точки), A9-01 (заглушка таблицы) ----
  const mob = await b.newContext({viewport:{width:393,height:851}, deviceScaleFactor:2.75, isMobile:true, hasTouch:true});
  const m = await mob.newPage(); m.on('pageerror', e => errs.push(e.message));
  await m.goto(BASE, {waitUntil:'networkidle'}); await m.waitForTimeout(600);
  const idle = await m.evaluate(()=>{const td=document.querySelector('td[colspan="9"]'); const tr=td.parentElement;
    return td.getBoundingClientRect().width / tr.getBoundingClientRect().width;});
  ok('A9-01: заглушка «шоков нет» на 393 px занимает строку целиком', idle > 0.85, +idle.toFixed(2));
  await m.goto(BASE + '#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.3:1', {waitUntil:'networkidle'}); await m.waitForTimeout(700);
  await m.evaluate(()=>document.getElementById('main').scrollIntoView({block:'center'})); await m.waitForTimeout(300);
  const hit = await m.evaluate(()=>{const r=document.getElementById('main').getBoundingClientRect(); const t=PANE.main.hits[0];
    return {x: r.left + t.x, y: r.top + t.y};});
  await m.touchscreen.tap(hit.x + 6, hit.y + 5); await m.waitForTimeout(500);
  ok('B2-01: касание точки открывает координаты', await m.evaluate(()=>!document.getElementById('coords').hidden && picked.length === 1));
  const cdp = await mob.newCDPSession(m); const y0 = await m.evaluate(()=>scrollY);
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:hit.x, y:hit.y + 60}]});
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:hit.x, y:hit.y + 60 - i*30}]});
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]}); await m.waitForTimeout(500);
  ok('B2-01: свайп по графику прокручивает страницу и точку не ставит',
     (await m.evaluate(()=>scrollY)) > y0 && (await m.evaluate(()=>picked.length)) === 1);

  // ---- A5-04: подпись подстройки не закрывает кружки точек на телефоне ----
  const nar = await b.newContext({viewport:{width:360,height:740}, deviceScaleFactor:3, isMobile:true, hasTouch:true});
  await nar.addInitScript(() => {
    window.__adj = [];
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(t, x, y){
      if (t === 'k растёт' || t === 'k падает')
        window.__adj.push({cv: this.canvas.id, x, y, w: this.measureText(t).width});
      return ft.apply(this, arguments);
    };
  });
  const q = await nar.newPage(); q.on('pageerror', e => errs.push(e.message));
  for (const [nm, h] of [['K ×2, L ×2, δ → 0,12', '#b=s:0.25:1,d:0.1:1,n:0:1,g:0:1,a:0.4:1&k=L:mul:2:1;K:mul:2:1;d:set:0.12:1'],
                         ['n 0 → 0,02', '#b=s:0.3:1,d:0.08:1,n:0:1,g:0:1,a:0.3333:1&k=n:set:0.02:1']]){
    await q.goto(BASE + h, {waitUntil:'networkidle'}); await q.waitForTimeout(600);
    const hid = await q.evaluate(() => {
      window.__adj = []; drawMain();
      const lab = window.__adj.filter(a => a.cv === 'main').pop();
      if (!lab) return ['подписи нет'];
      return PANE.main.hits.filter(p => p.x > lab.x - 4 && p.x < lab.x + lab.w + 4 && Math.abs(p.y - lab.y) < 12).map(p => p.id);
    });
    ok('A5-04: ' + nm + ', 360 px — подпись подстройки не закрывает ни одного кружка', hid.length === 0, hid);
  }

  // ---- Р8: крайние стационары — картинка и траектории в логарифмах ----
  /* При s = 0,0005, δ = n = g = 0,99 и α = 0,99 стационар k ≈ e⁻⁸⁶⁹, а после
     «s × 2» — e⁻⁸⁰⁰: для компьютера оба ноль. Картинка теряла все отметки,
     траектории пропадали, «Показатели» писали 0,000. */
  await go('#b=s:0.0005:1,d:0.99:1,n:0.99:1,g:0.99:1,a:0.99:1&k=s:mul:2:1');
  await reveal();
  const ext = await ev(()=>({
    marks: statesOf().filter(s=>s.axis).map(s=>s.mark),
    hits: PANE.main.hits.length,
    paths: document.querySelectorAll('#pathrows canvas').length,
    shown: !document.getElementById('pathsblock').hidden,
    gap: (()=>{ const d = pathData(); if (!d) return null; const l = d.pts[d.pts.length-1].v;
      return Math.max(...['y','k','c','i'].map(v=>Math.abs(l[v]/d.endAt[v]-1))); })(),
    ro: document.getElementById('ro').textContent }));
  ok('Р8: стационар e⁻⁸⁶⁹ — на оси old, k₁ и new', JSON.stringify(ext.marks) === '["old","k₁","new"]', ext.marks);
  ok('Р8: и все точки на месте', ext.hits >= 4, ext.hits);
  ok('Р8: и траектории нарисованы и приходят в new', ext.shown && ext.paths === 4 && ext.gap !== null && ext.gap < 0.01,
     {shown: ext.shown, paths: ext.paths, gap: ext.gap});
  ok('Р8: «Показатели» пишут число, а не ноль', /10⁻³⁷⁸/.test(ext.ro) && !/0,000/.test(ext.ro), ext.ro);

  // ---- Р1, Р8: одна область значений — любой «?» повторяется руками ----
  /* s свободна, «s + 0,05» и «α → 0,6», δ = 0,02, α = 0,2: долгосрочное c
     получает «?» только при s после шока выше 0,9965. Раньше такие значения
     ставил только перебор: руками шок подрезался до s = 0,99, и увидеть
     падение c было нельзя. Теперь граница одна и та же у всех. */
  const t7 = async () => ev(()=>[...document.querySelectorAll('#fx tr:not(.case)')].pop().querySelectorAll('td.v')[6].textContent.trim());
  await go('#b=s:0.2:0,d:0.02:1,n:0:1,g:0:1,a:0.2:1&k=s:add:0.05:1;a:set:0.6:1'); await reveal();
  const cFree = await t7();
  await go('#b=s:0.9499:1,d:0.02:1,n:0:1,g:0:1,a:0.2:1&k=s:add:0.05:1;a:set:0.6:1'); await reveal();
  const cHand = await t7(), vHand = await ev(()=>shocks[0].value);
  ok('Р1: «?» у c из перебора повторяется руками: s = 0,9499 и «+0,05» дают c ↓',
     cFree === '?' && cHand === '↓' && Math.abs(vHand - 0.05) < 1e-12, {cFree, cHand, vHand});
  /* точные концы в «Перебор сужен»: s + 0,1 осмысленна при s до 0,899999 */
  await go('#b=s:0.2:0,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:add:0.1:1'); await reveal();
  const cutNote = await ev(()=>document.getElementById('notes').textContent);
  ok('Р23а: концы отрезка в «Перебор сужен» точные, а не узлы сетки',
     /s от 0,000001 до 0,899999/.test(cutNote), cutNote.slice(0, 160));
  /* числа — столько знаков, сколько нужно: 0,0005 не пишется как 0,001 */
  await go('#b=s:0.0005:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.0007:1');
  const fmt = await ev(()=>({cell: document.getElementById('nb-s').value,
    head: document.querySelector('[data-head="0"]').textContent.replace(/\s+/g, ' ').trim()}));
  ok('Р8: s = 0,0005 в ячейке и в шапке шока — «0,0005», а не «0,001»',
     fmt.cell === '0,0005' && fmt.head === 's: 0,0005 → 0,0007', fmt);

  // ---- Р7: границы шока — от нарисованного значения ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.5:1&k=a:add:0.3:1');
  const r7a = await ev(()=>FORM.add.rng('a'));
  ok('Р7: при заданной α = 0,5 шок «+» — не больше +0,499', Math.abs(r7a[1] - 0.499) < 1e-9, r7a);
  /* У свободной — от примера. «α + 0,5» при примере 0,5 рисовал диаграмму
     при α = 1: без нового стационара и без траекторий. */
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.5:0&k=a:add:0.5:1'); await reveal();
  const r7b = await ev(()=>({v: shocks[0].value, marks: statesOf().filter(s=>s.axis).map(s=>s.mark),
    paths: document.querySelectorAll('#pathrows canvas').length,
    touch: document.querySelector('[data-touch="0"]').textContent}));
  ok('Р7: у свободной α — от примера: «+0,5» при примере 0,5 подрезан до +0,499',
     Math.abs(r7b.v - 0.499) < 1e-9, r7b.v);
  ok('Р7: и картинка рисует новое равновесие и траектории', r7b.marks.includes('new') && r7b.paths > 0, r7b);
  ok('Р23д: карточка шока говорит, что значение из ссылки подрезано',
     /Значение из ссылки \(\+0,500\) выводило α за границы/.test(r7b.touch), r7b.touch);
  await ev(()=>{ const e = document.getElementById('nk0-a'); e.value = '0,2'; e.dispatchEvent(new Event('change', {bubbles:true})); });
  await p.waitForTimeout(300);
  ok('Р23д: а после своего значения пометка уходит',
     !/Значение из ссылки/.test(await ev(()=>document.querySelector('[data-touch="0"]').textContent)));

  // ---- Р8: точность знака и края перебора на новых границах ----
  /* α свободна, «α × 1,3»: у α около 0,000001 и у самой k = 1 настоящее
     изменение выпуска — 10⁻¹², а порог «=» был 1e-11. Внутри ветки вставало
     ложное «=» вперемешку со стрелками — «?» там, где сторона решает знак. */
  await go('#b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3333333333:0&k=a:mul:1.3:1');
  const prec = await ev(()=>{ const fk = forkCase(); if (!fk) return 'развилки нет';
    return fk.cases.map(c => c.text + ': ' + caseSweep(c.lim).map(r => r.sr.concat(r.lr).join(',')).join(' ')); });
  ok('Р8: единственный шок по α при α около 0,000001 — в ветках нет «?»',
     Array.isArray(prec) && prec.every(t => !/dunno/.test(t)), prec);
  ok('Р8: изменение 10⁻¹² — стрелка, а не «=»',
     await ev(()=>{ const q = {s:0.1, d:0.1 * Math.exp(-5e-6), n:0, g:0, a:1e-6};
       return compare(q, {...q, a:1.3e-6}, 1).sr[0]; }) === 'up');
  /* Край δ: при s = 0,04, α = 0,15 и шоках «s × 1,5, g + 0,01, δ × 0,8»
     долгосрочные инвестиции падают при δ до ~0,0005, а равномерная сетка
     (шаг 0,0007) в эту полосу не попадала. */
  await go('#b=s:0.04:1,d:0.4:0,n:0:1,g:0:1,a:0.15:1&k=s:mul:1.5:1;g:add:0.01:1;d:mul:0.8:1');
  const edgeI = await ev(()=>{ const r = sweepCached(); return r[r.length-1].lr[3]; });
  ok('Р8: полоса у нижнего края δ видна — долгосрочные i «?», а не «↑»', edgeI === 'dunno', edgeI);
  /* Сторона-полоска у края: «s × 0,05» не пускает s ниже 0,00002, и сторона
     «k < 1» при δ = 0,02 — это s от 0,00002 до 0,02; сетка развилки проходила
     мимо неё целиком, и диаграмма была одна. */
  await go('#b=s:0.9:0,d:0.02:1,n:0:1,g:0:1,a:0.88:0&k=a:mul:3:1;s:mul:0.05:1');
  ok('Р8: сторона-полоска у края найдена — диаграмм две',
     await ev(()=>!!forkCase() && !document.getElementById('fork2').hidden),
     await ev(()=>({fork: !!forkCase(), fork2: !document.getElementById('fork2').hidden})));

  // ---- Р8, вариант 2: граница перебора видна ----
  /* δ = 0,9, n 0,1 → 0,12, α 0,40 → 0,3995, s не задана: долгосрочно k
     падает при любой s от 0,000001 до 0,999999, а при s ниже ~5·10⁻¹¹ растёт.
     Ответ решает граница, и страница обязана это сказать. */
  await go('#b=s:0.3:0,d:0.9:1,n:0.1:1,g:0:1,a:0.4:1&k=n:set:0.12:1;a:set:0.3995:1');
  const gb0 = await ev(()=>{ const r = document.getElementById('fxrange');
    return {range: r && !r.hidden ? r.textContent : null,
            plaque: /Граница перебора/.test(document.getElementById('notes').textContent)}; });
  ok('Р8: строка о границах перебора видна и до ответа',
     gb0.range === 'Неизвестный параметр перебирается: s — от 0,000001 до 0,999999.', gb0);
  ok('Р8: а плашка «Граница перебора» — только вместе с ответом', !gb0.plaque);
  await reveal();
  const gb1 = await ev(()=>({notes: document.getElementById('notes').textContent,
    cell: [...document.querySelectorAll('#fx tr:not(.case)')].pop().querySelectorAll('td.v')[5].textContent}));
  ok('Р8: за нижней границей s знак другой — плашка «Граница перебора» с примером',
     /Граница перебора/.test(gb1.notes) && /s = 10⁻¹¹/.test(gb1.notes), gb1.notes.slice(0, 200));
  ok('Р8: и задетая стрелка помечена °', gb1.cell === '↓°', gb1.cell);
  const gbP = [];
  for (let i = 0; i < await ev(()=>PROBLEMS.length); i++){
    await ev(i=>document.querySelector('[data-p="'+i+'"]').click(), i); await p.waitForTimeout(500); await reveal();
    if (await ev(()=>(typeof edgeFlags === 'function' && edgeFlags().length > 0) ||
                     /Граница перебора/.test(document.getElementById('notes').textContent))) gbP.push(i + 1);
  }
  ok('Р8: в задачах семинара граница перебора ничего не решает', gbP.length === 0, gbP);

  // ================= фаза 3: таблица и картинка =================

  // ---- Р2: заметка про свободные n и g ----
  /* s = 0,2 и δ = 0,1 заданы, α 0,3 → 0,5. Со свободными n и g диаграмм две
     и в итоге сплошные «?»; с n = g = 0 диаграмма одна и всё определено. */
  await go('#b=s:0.2:1,d:0.1:1,n:0:0,g:0:0,a:0.3:1&k=a:set:0.5:1');
  const ng1 = await ev(()=>{ const e = document.getElementById('ngnote'); return e && !e.hidden ? e.textContent : null; });
  ok('Р2: свободные n и g решают ответ — заметка видна и до «Показать ответ»',
     ng1 === 'n и g сейчас не заданы — перебор проходит все их возможные значения, и от этого зависит ответ. ' +
            'Если в условии рост населения и технический прогресс равны нулю, нажмите «задано» у n и g и поставьте 0.', ng1);
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=a:set:0.5:1');
  ok('Р2: n = g = 0 заданы — заметки нет',
     await ev(()=>{ const e = document.getElementById('ngnote'); return !e || e.hidden; }));
  await go('#b=s:0.2:1,d:0.1:1,n:0:0,g:0:0,a:0.3:1&k=K:mul:0.8:1');
  ok('Р2: n и g свободны, но на ответ не влияют — заметки нет',
     await ev(()=>{ const e = document.getElementById('ngnote'); return !e || e.hidden; }));
  await go('');
  ok('Р2: подпись единиц на чистой странице — «подушевые; если g > 0 — на единицу эффективного труда»',
     /подушевые; если g > 0 — на единицу эффективного труда/.test(await ev(()=>document.getElementById('fxunits').textContent)),
     await ev(()=>document.getElementById('fxunits').textContent));

  // ---- Р3: строки случаев в таблице ----
  /* Задача 5: у строки α и у «итого» ответ по случаям разный — под ними
     вложенные строки «k < 1» и «k > 1»; у строки s одинаковый — вложенных нет. */
  await go('#p=4&b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1');
  const cr0 = await ev(()=>[...document.querySelectorAll('#fx tr')].map(tr => (tr.classList.contains('case') ? '  ' : '') +
    tr.querySelector('th').textContent.trim() + ' ' + [...tr.querySelectorAll('td.v')].map(t=>t.textContent.trim()).join('')));
  ok('Р3: под строкой α и под «итого» — строки случаев, под строкой s — нет',
     cr0.length === 7 && /^  1k < 1/.test(cr0[2]) && /^  2k > 1/.test(cr0[3]) && /^  1k < 1/.test(cr0[5]) && /^  2k > 1/.test(cr0[6]), cr0);
  ok('Р3: до ответа в строках случаев точки', cr0.filter(r=>/^  /.test(r)).every(r=>/········$/.test(r)), cr0);
  await reveal();
  const cr1 = await ev(()=>[...document.querySelectorAll('#fx tr.case')].map(tr=>[...tr.querySelectorAll('td.v')].map(t=>t.textContent.trim()).join('')));
  ok('Р3: после ответа — стрелки случаев совпадают с перебором ветки',
     JSON.stringify(cr1) === JSON.stringify(await ev(()=>{ const fk = forkCase(), G = {up:'↑',down:'↓',same:'=',dunno:'?'};
       const out = []; [1, 2].forEach(i => fk.cases.forEach(c => { const r = caseSweep(c.lim)[i];
         out.push(r.sr.concat(r.lr).map(x=>G[x]).join('')); })); return out; })), cr1);

  // ---- Р3: траектории — «сразу · потом», а не общий «?» ----
  /* Задача 6, случай k < 1: сразу y, c, i растут, потом не определено. */
  await go('#p=5&b=s:0.2:0,d:0.05:1,n:0:1,g:0:1,a:0.4:1&k=n:set:0.02:1;a:set:0.35:1'); await reveal();
  const pq = await ev(()=>[...document.querySelectorAll('#pathrows .pathq')].map(e=>e.textContent.replace(/\s+/g,' ').trim()));
  ok('Р3: в траектории задачи 6 при k < 1 — «сразу ↑ · потом ?» у y, c и i',
     ['y','c','i'].every(v => pq.some(t => t.startsWith(v) && /сразу ↑ · потом \?/.test(t))), pq);

  // ---- Р4: один из возможных исходов ----
  await go('#p=4&b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1');
  const oc0 = await ev(()=>{ const c = document.getElementById('oc1'), l = document.getElementById('ol1');
    return {cap: c && !c.hidden ? c.textContent : null, list: !l || l.hidden}; });
  ok('Р4: над диаграммой «k < 1» — «один из возможных исходов»', /[Оо]дин из возможных исходов/.test(oc0.cap || ''), oc0);
  ok('Р4: а список исходов — только вместе с ответом', oc0.cap !== null && oc0.list === true, oc0);
  await reveal();
  const ol = await ev(()=>[...document.querySelectorAll('#ol1 li')].map(li=>li.textContent.replace(/\s+/g,' ').trim()));
  ok('Р4: исходов в случае k < 1 задачи 5 — четыре, у каждого пример δ, нарисованный помечен',
     ol.length === 4 && ol.every(t=>/δ = /.test(t)) && ol.filter(t=>/нарисован/.test(t)).length === 1, ol);

  // ---- Р5: шок «→ новое» до исходного значения ----
  await go('');
  await ev(()=>{ document.getElementById('addsel').value='a'; document.getElementById('add').click(); });
  await p.waitForTimeout(300);
  await ev(()=>{ document.querySelector('[data-fscope="k0-"][data-form="set"]').click(); });
  await p.waitForTimeout(300);
  const t5 = await ev(()=>document.querySelector('[data-touch="0"]').textContent);
  ok('Р5: «0,333 — пример, а не условие: впишите исходное α в блоке 2»',
     /0,333 — пример, а не условие: впишите исходное α в блоке 2/.test(t5), t5);
  await ev(()=>{ const e = document.getElementById('nb-a'); e.value = '0,3'; e.dispatchEvent(new Event('change', {bubbles:true})); });
  await p.waitForTimeout(300);
  ok('Р5: вписали исходное — пометка ушла', !/пример, а не условие/.test(await ev(()=>document.querySelector('[data-touch="0"]').textContent)));

  // ---- Р19: значение шока помнится для каждой вкладки ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.35:1');
  await ev(()=>{ document.querySelector('[data-fscope="k0-"][data-form="add"]').click(); });
  await p.waitForTimeout(250);
  await ev(()=>{ document.querySelector('[data-fscope="k0-"][data-form="set"]').click(); });
  await p.waitForTimeout(250);
  ok('Р19: «новое» 0,35 → «на сколько» → «новое» — снова 0,35', await ev(()=>shocks[0].form === 'set' && Math.abs(shocks[0].value - 0.35) < 1e-12),
     await ev(()=>[shocks[0].form, shocks[0].value]));

  // ---- Р21: «задано ↔ свободно» без видимой реакции объясняет себя ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=K:mul:0.8:1');
  await ev(()=>{ document.querySelector('[data-pin="d"]').click(); }); await p.waitForTimeout(400);
  const h21 = await ev(()=>{ const e = document.querySelector('[data-pinnote="d"]'); return e && !e.hidden ? e.textContent : null; });
  ok('Р21: δ стало свободным, а ответ прежний — «Ответ от δ не зависит — поэтому ничего не изменилось»',
     h21 === 'Ответ от δ не зависит — поэтому ничего не изменилось', h21);

  // ---- Р6: «Показатели» под ответом ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.3:1');
  const ro0 = await ev(()=>{ const b = document.getElementById('roblock'); return {hidden: !b || b.hidden,
    underTable: !!b && !!document.querySelector('.fx-wrap') &&
      (document.querySelector('.fx-wrap').compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
    inPanel: !!b && !!b.closest('.panel')}; });
  ok('Р6: «Показатели» стоят под таблицей, а не в панели', ro0.underTable && !ro0.inPanel, ro0);
  ok('Р6: и закрыты до «Показать ответ»', ro0.hidden, ro0);
  await reveal();
  const ro1 = await ev(()=>[...document.querySelectorAll('#ro tr')].map(tr=>tr.textContent.replace(/\s+/g,' ').trim()));
  const roh = await ev(()=>(document.getElementById('ro-head') || {textContent: ''}).textContent);
  ok('Р6: рядом с новым значением — старое', /было.*стало/.test(roh) && ro1.some(t=>/^y\* — выпуск\s*\d/.test(t)), {roh, ro1});
  await go('#p=4&b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1'); await reveal();
  const ro2 = await ev(()=>[...document.querySelectorAll('#ro-head th')].map(t=>t.textContent.trim()));
  ok('Р6: на развилке — две колонки, по калибровкам диаграмм', ro2.some(t=>/k < 1/.test(t)) && ro2.some(t=>/k > 1/.test(t)), ro2);

  // ---- Р14: легенда называет все шоки, и K × тоже ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.3:1;K:mul:0.8:1');
  const lg = await ev(()=>legendItems(statesOf()).map(i=>i.t));
  ok('Р14: в легенде оба шока с номерами, K × — «куда бросило бы сразу»',
     lg.some(t=>/^1 · s/.test(t)) && lg.some(t=>/^2 · K ×0,80 — куда бросило бы сразу/.test(t)), lg);
  ok('Р14: и строка про kᵢ', lg.some(t=>/kᵢ — где оказалась бы экономика с одним шоком i/.test(t)), lg);

  // ---- Р18: кривые сдвинулись, стационар нет — «old, new» ----
  await go('#b=s:0.2:1,d:0.06:1,n:0:1,g:0.02:1,a:0.3:1&k=s:set:0.25:1;g:set:0.04:1');
  const on = await ev(()=>({marks: statesOf().filter(s=>s.axis).map(s=>s.mark), legend: legendItems(statesOf()).map(i=>i.t)}));
  ok('Р18: s 0,20 → 0,25 и g 0,02 → 0,04 — на оси и old, и new', on.marks.includes('old') && on.marks.includes('new'), on);
  ok('Р18: и в легенде «новое равновесие»', on.legend.includes('новое равновесие'), on.legend);

  // ---- Р22: стационары разнесены больше чем в 20 раз ----
  /* s 0,20 → 0,02 при α = 0,5: k падает в (0,02/0,2)² = 100 раз */
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.5:1&k=s:set:0.02:1');
  const fr = await ev(()=>{ const e = document.getElementById('farnote1'); return e && !e.hidden ? e.textContent : null; });
  ok('Р22: new в 100 раз левее old — заметка и кнопка «Показать new крупно»',
     /Новое равновесие в 100 раз левее old/.test(fr || '') && /Показать new крупно/.test(fr || ''), fr);
  await ev(()=>{ const b = document.querySelector('[data-far="main"]'); if (b) b.click(); });
  await p.waitForTimeout(300);
  const fz = await ev(()=>{ const v = PANE.main.view, n = statesOf().find(s=>s.final);
    return {view: !!v, newInside: !!v && n.k > v.k0 && n.k < v.k1 && v.k1 < 0.2}; });
  ok('Р22: кнопка приближает new — он в окне, а окно уже 0,2 от old', fz.view && fz.newInside, fz);

  // ---- ссылка в той же вкладке сбрасывает приближение ----
  /* Переход по ссылке, где меняется только хеш, страницу не перезагружает.
     Окно приближения от прошлого состояния оставалось, и новая картинка
     могла оказаться за его краем. */
  await ev(()=>{ PANE.main.view = {k0: 0, k1: 0.1, y0: 0, y1: 0.1}; drawMain(); });
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=a:set:0.5:1');
  ok('ссылка в той же вкладке сбрасывает приближение', await ev(()=>PANE.main.view === null), await ev(()=>PANE.main.view));

  // ---- Р23б: уровень скачка подписан на оси y ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=a:set:0.5:1');
  const yl = await ev(()=>{ window.__ytags = []; const tg = window.tagSub; window.tagSub = function(ctx, x, y, a, b){ window.__ytags.push(b); return tg.apply(this, arguments); };
    try { drawMain(); } finally { window.tagSub = tg; } return window.__ytags; });
  ok('Р23б: шок по α — на оси y подписан y_скачок', yl.includes('скачок'), yl);
  // ---- Р15: палитра для обычного зрения ----
  const pal = await ev(()=>['--sh1','--sh2','--sh3','--res','--gold'].map(v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim().toUpperCase()));
  ok('Р15: цвета шоков, итога и golden rule — новые', JSON.stringify(pal) === JSON.stringify(['#1565C0','#E8590C','#2E7D32','#8E24AA','#F2B705']), pal);
  /* подписи на белом читаются: текст оранжевого и жёлтого — тёмным тоном */
  const inks = await ev(()=>typeof inkOf === 'function' ? [inkOf(col('--sh2')), inkOf(col('--gold'))].map(x=>x.toUpperCase()) : null);
  ok('Р15: подписи шока 2 и golden rule — тёмным тоном того же цвета', JSON.stringify(inks) === JSON.stringify(['#C24A0A','#8A6400']), inks);

  // ---- Р16: неактивные кнопки читаются ----
  await go('');
  const dis = await ev(()=>{ const b = document.getElementById('reveal'), cs = getComputedStyle(b);
    const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0,3).map(Number);
    const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
      const [r,g,bb] = c.map(f); return 0.2126*r + 0.7152*g + 0.0722*bb; };
    const a = L(rgb(cs.color)), z = L(rgb(cs.backgroundColor));
    return {disabled: b.disabled, opacity: cs.opacity, ratio: +((Math.max(a,z)+0.05)/(Math.min(a,z)+0.05)).toFixed(2)}; });
  ok('Р16: «Показать ответ» без шоков — контраст не ниже 4,5:1', dis.disabled && dis.opacity === '1' && dis.ratio >= 4.5, dis);

  // ---- Р17: координаты — «k / k_old» и «y / y_old» ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.3:1');
  await ev(()=>{ togglePoint('base-out', 'main'); });
  const ch = await ev(()=>document.getElementById('coords-body').innerHTML);
  ok('Р17: столбцы координат — «k / k_old» и «y / y_old»', /k \/ k<sub>old<\/sub>/.test(ch) && /y \/ y<sub>old<\/sub>/.test(ch), ch.slice(0, 200));

  // ---- Р23г: наведение на карточку задачи видно по рамке ----
  await go('');
  await p.hover('[data-p="0"]'); await p.waitForTimeout(150);
  const hb = await ev(()=>getComputedStyle(document.querySelector('[data-p="0"]')).borderTopColor);
  ok('Р23г: при наведении рамка карточки задачи темнеет', hb === 'rgb(86, 92, 102)', hb);

  // ---- Р20: подсветка точки, отметка по Enter ----
  await go('#b=s:0.2:1,d:0.1:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.3:1');
  await p.focus('#main');
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(150);
  const kb1 = await ev(()=>({picked: picked.length, focus: PANE.main.focusId || null}));
  ok('Р20: стрелка ведёт подсветку и ничего не отмечает', kb1.picked === 0 && !!kb1.focus, kb1);
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok('Р20: Enter отмечает подсвеченную точку', await ev(()=>picked.length) === 1);
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok('Р20: второй Enter снимает отметку', await ev(()=>picked.length) === 0);

  /* мышь: наведение подсвечивает точку ещё до щелчка */
  await ev(()=>{ picked = []; drawMain(); });
  const hp = await ev(()=>{ const h = PANE.main.hits[0], r = document.getElementById('main').getBoundingClientRect();
    return {x: r.left + h.x, y: r.top + h.y, id: h.id}; });
  await p.mouse.move(hp.x, hp.y); await p.waitForTimeout(200);
  ok('Р20: наведение мышью подсвечивает точку', await ev(()=>PANE.main.hoverId || null) === hp.id,
     await ev(()=>PANE.main.hoverId || null));

  // ---- Р3: в строках случаев стрелки не мельче ----
  /* Стрелки читаются формой, а не цветом, и держит это кегль (CLAUDE.md,
     «Стрелки в таблице читаются формой»): во вложенных строках случаев он
     тот же, что в строке над ними, — и на широком экране, и в карточках. */
  const glyphSize = pg => pg.evaluate(()=>{ const par = document.querySelector('#fx tr:not(.case) td.v'),
    cs = document.querySelector('#fx tr.case td.v');
    return [getComputedStyle(par).fontSize, cs ? getComputedStyle(cs).fontSize : null]; });
  await go('#p=4&b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1'); await reveal();
  const gs1 = await glyphSize(p);
  ok('Р3: стрелки в строках случаев того же кегля, что в строке над ними', gs1[0] === gs1[1], gs1);
  await q.goto(BASE + '#p=4&b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1', {waitUntil:'networkidle'});
  await q.waitForTimeout(600);
  await q.evaluate(()=>{ const r = document.getElementById('reveal'); if (r && !r.disabled) r.click(); });
  await q.waitForTimeout(400);
  const gs2 = await glyphSize(q);
  ok('Р3: и во вложенных карточках на телефоне', gs2[0] === gs2[1], gs2);

  // ======================= фаза 4: разборы и «Конспект» =======================
  const GL = {up:'↑', down:'↓', same:'=', dunno:'?'};
  const lastLR = async h => { await go(h);
    return ev(G=>{ const r = sweepCached(); return r[r.length-1].lr.map(x=>G[x]).join(''); }, GL); };
  const PN4 = await ev(()=>PROBLEMS.length);
  /* весь текст разборов и условий — для проверок на слова */
  const allText = await ev(()=>PROBLEMS.map(q => [q.ask].concat(q.why.map(w => [].concat(w[1]).join(' ') + ' ' + w[2]))
    .join(' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#8722;/g, '−').replace(/&#8594;/g, '→')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ')));
  const byTitle = async re => ev(src => PROBLEMS.findIndex(q => new RegExp(src).test(q.title)), re.source);

  // ---- Р12: порядок задач и новая задача 3 ----
  const titles = await ev(()=>PROBLEMS.map(q=>q.title));
  ok('Р12: шесть задач от простой к сложной', JSON.stringify(titles) === JSON.stringify([
    'Задача 1. K вниз, L вверх', 'Задача 2. s вверх, δ вверх', 'Задача 3. s вверх, δ вверх',
    'Задача 4. K вверх, g вверх', 'Задача 5. s вверх, α вверх', 'Задача 6. n вверх, α вниз']), titles);
  const sub3 = await ev(()=>{ const b = document.querySelector('#probs [data-p="2"] small'); return b ? b.textContent : ''; });
  ok('Р12: задача 3 — s 0,20 → 0,22 и δ 0,05 → 0,06', /s\s*0,20*\s*→\s*0,220*/.test(sub3) && /δ\s*0,050*\s*→\s*0,060*/.test(sub3), sub3);
  ok('Р12: гайд знает, что задач шесть', await ev(()=>/шесть задач/.test(document.getElementById('guide').textContent)));
  const i3 = await byTitle(/^Задача 3\. s вверх, δ вверх$/);
  ok('Р12: задача 3 — порог по α назван, и модель с ним согласна',
     i3 === 2 && /0,52/.test(allText[2]) &&
     (await lastLR('#b=s:0.2:1,d:0.05:1,n:0:1,g:0:1,a:0.5:1&k=s:set:0.22:1;d:set:0.06:1')) === '↓↓↓↑' &&
     (await lastLR('#b=s:0.2:1,d:0.05:1,n:0:1,g:0:1,a:0.55:1&k=s:set:0.22:1;d:set:0.06:1')) === '↓↓↓↓', allText[2] && allText[2].slice(0, 80));
  ok('Р12: задача 3 показывает, почему пункты ошибаются', /пункт/.test(allText[2] || '') && /0,005·k₀/.test(allText[2] || ''));

  // ---- Р11: мелкие правки разборов ----
  const banned = [];
  allText.forEach((t, i) => [/за период/, /рубл/, /переносит вес/, /неправдоподобн/, /α — снизилась/].forEach(re => {
    if (re.test(t)) banned.push({задача: i + 1, фраза: t.match(new RegExp('.{0,30}' + re.source + '.{0,20}'))[0]}); }));
  ok('Р11: нет «за период», «рубля на работника», «переносит вес», «неправдоподобна», «α — снизилась»', banned.length === 0, banned);
  const midCalc = await ev(()=>{ const bad = [];
    PROBLEMS.forEach((q, i) => q.why.forEach((st, j) => [].concat(st[1]).forEach((t, k) => {
      const n = (t.match(/<code class="calc">/g) || []).length;
      const tail = n ? t.slice(t.lastIndexOf('</code>') + 7).replace(/<[^>]+>/g, '').trim() : '';
      if (n > 1 || tail) bad.push((i + 1) + '.' + (j + 1) + '.' + (k + 1)); })));
    return bad; });
  ok('Р11: выкладка стоит в конце своего шага, одна на шаг', midCalc.length === 0, midCalc);
  ok('Р11: 1 − 0,64 = 0,36 выведено', /1 − 0,64 = 0,36/.test(allText[0]));
  ok('Р11: строка δ краткосрочно объяснена в задачах 2 и 3',
     /строк\S* δ/i.test(allText[1]) && /строк\S* δ/i.test(allText[2] || ''));
  ok('Р11: задача 2 — i = s·y, выросли оба множителя', /оба множителя/.test(allText[1]));
  ok('Р11: задача 2 — потребление при α = 0,18 падает, при α = 0,20 растёт, и модель согласна',
     /0,18/.test(allText[1]) && /0,20/.test(allText[1]) &&
     (await lastLR('#b=s:0.1:1,d:0.1:1,n:0:1,g:0:1,a:0.18:1&k=s:set:0.2:1;d:set:0.12:1')) === '↑↑↓↑' &&
     (await lastLR('#b=s:0.1:1,d:0.1:1,n:0:1,g:0:1,a:0.2:1&k=s:set:0.2:1;d:set:0.12:1')) === '↑↑↑↑');
  const i4 = await byTitle(/K вверх, g вверх/);
  const sub4 = await ev(i=>{ const b = document.querySelector('#probs [data-p="' + i + '"] small'); return b ? b.textContent : ''; }, i4);
  ok('Р11: шок по g записан одинаково — в подписи, в карточке и в разборе',
     /g\s*0,0+\s*→\s*0,050*/.test(sub4) && /g: 0 → 0,05/.test(allText[i4] || ''), sub4);
  ok('Р11: задача с g — почему хватает разности и весь путь точки',
     /разност/i.test(allText[i4] || '') && /1,1·k₀/.test(allText[i4] || '') && /мимо/.test(allText[i4] || ''));

  // ---- Р9, Р10: задача про s и α ----
  const i5 = await byTitle(/s вверх, α вверх/), tx5 = allText[i5] || '';
  ok('Р10: строка s — потребление +1,6% при любой δ, справа — не меньше +2,6%', /1,6%/.test(tx5) && /2,6%/.test(tx5));
  ok('Р9: пороги слева названы, и модель с ними согласна',
     /0,76/.test(tx5) && /0,32/.test(tx5) && /0,253/.test(tx5) &&
     /маловероятн\S*, но условие (её )?не исключает — учитываем/.test(tx5) &&
     (await lastLR('#b=s:0.2:1,d:0.25:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1')) === '↑↑↑↑' &&
     (await lastLR('#b=s:0.2:1,d:0.257:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1')) === '↑↑↓↑' &&
     (await lastLR('#b=s:0.2:1,d:0.33:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1')) === '↓↑↓↑' &&
     (await lastLR('#b=s:0.2:1,d:0.77:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1')) === '↓↓↓↓' &&
     (await lastLR('#b=s:0.2:1,d:0.199:1,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1')) === '↑↑↑↑');

  // ---- Р13: задача про n и α ----
  const i6 = await byTitle(/n вверх, α вниз/), tx6 = allText[i6] || '';
  ok('Р13: три исхода слева — пороги 0,09% и 1,22%, и модель с ними согласна',
     /0,09%/.test(tx6) && /1,22%/.test(tx6) && /маловероятн\S*, но условие (её )?не исключает — учитываем/.test(tx6) &&
     (await lastLR('#b=s:0.0008:1,d:0.05:1,n:0:1,g:0:1,a:0.4:1&k=n:set:0.02:1;a:set:0.35:1')) === '↑↑↑↑' &&
     (await lastLR('#b=s:0.001:1,d:0.05:1,n:0:1,g:0:1,a:0.4:1&k=n:set:0.02:1;a:set:0.35:1')) === '↑↓↑↑' &&
     (await lastLR('#b=s:0.012:1,d:0.05:1,n:0:1,g:0:1,a:0.4:1&k=n:set:0.02:1;a:set:0.35:1')) === '↑↓↑↑' &&
     (await lastLR('#b=s:0.0125:1,d:0.05:1,n:0:1,g:0:1,a:0.4:1&k=n:set:0.02:1;a:set:0.35:1')) === '↓↓↓↓');
  ok('Р13: ответ вопроса 3 называет три исхода', await ev(i=>{ const q = PROBLEMS[i]; return !!q && /1,22%/.test(q.why[2][2]) && /0,09%/.test(q.why[2][2]); }, i6));

  // ---- формулировка про α (вариант В) ----
  ok('РВ: в разборах с α кривая выпуска поворачивается вокруг (1; 1), а единица — не экономический порог',
     [tx5, tx6].every(t => /поворачивается вокруг точки \(1; 1\)/.test(t) && /не экономический порог/.test(t)));
  await go('#b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1');
  const leadA = await ev(()=>document.getElementById('forklead').textContent);
  await go('#b=s:0.2:0,d:0.05:1,n:0:1,g:0:1,a:0.4:1&k=n:set:0.02:1;a:set:0.35:1');
  const leadB = await ev(()=>document.getElementById('forklead').textContent);
  ok('РВ: над развилкой — «поворачивает кривую выпуска» в нужную сторону',
     /Рост α поворачивает кривую выпуска вокруг точки k = 1: правее выпуск растёт, левее падает/.test(leadA) &&
     /Падение α поворачивает кривую выпуска вокруг точки k = 1: правее выпуск падает, левее растёт/.test(leadB), [leadA.slice(0, 160), leadB.slice(0, 160)]);

  // ---- Р11: «Конспект» ----
  await go('');
  const kb = await ev(()=>{ const b = document.querySelector('.toprow > [data-kn="0"]'), g = document.getElementById('guide');
    return {btn: !!b && !!g && b.parentElement === g.parentElement, dlg: !!document.getElementById('kons')}; });
  ok('Р11: кнопка «Конспект» стоит рядом с гайдом', kb.btn && kb.dlg, kb);
  if (kb.btn && kb.dlg){
    await p.click('.toprow > [data-kn="0"]'); await p.waitForTimeout(250);
    const k1 = await ev(()=>{ const d = document.getElementById('kons');
      return {open: d.open, modal: d.matches(':modal'), items: d.querySelectorAll('.kn > li').length,
              fig: !!d.querySelector('figure svg'), focus: d.contains(document.activeElement)}; });
    ok('Р11: «Конспект» открывается поверх страницы — двенадцать пунктов и схема',
       k1.open && k1.modal && k1.items === 12 && k1.fig && k1.focus, k1);
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok('Р11: Escape закрывает, фокус возвращается на кнопку', await ev(()=>!document.getElementById('kons').open &&
       document.activeElement === document.querySelector('.toprow > [data-kn="0"]')));
    await p.click('.toprow > [data-kn="0"]'); await p.waitForTimeout(200);
    await p.click('#kons-x'); await p.waitForTimeout(200);
    ok('Р11: крестик закрывает', await ev(()=>!document.getElementById('kons').open));
    const kt = await ev(()=>document.getElementById('kons').textContent.replace(/\s+/g, ' '));
    ok('Р11: замкнутой формулы стационара в «Конспекте» нет',
       !/1\s*\/\s*\(\s*1\s*[−-]\s*α\s*\)/.test(kt) && !/k\*\s*=\s*\(/.test(kt) && !/переносит вес/.test(kt));
    ok('Р11: формулировка про α в «Конспекте» — та же, с примером на числах',
       /поворачивается вокруг точки \(1; 1\)/.test(kt) && /1,52/.test(kt) && /1,62/.test(kt) && /0,66/.test(kt) && /0,62/.test(kt));
  } else ['открывается', 'Escape', 'крестик', 'формула', 'формулировка'].forEach(n => ok('Р11: «Конспект» — ' + n, false, 'окна нет'));

  /* в начале каждого разбора — кнопка, первое упоминание термина — ссылка на свой пункт */
  const TERMS = [[/капиталовооружённост/i, 1], [/крив\S* выпуска/i, 2], [/крив\S* инвестиций/i, 3], [/выбыти/i, 4],
                 [/Δk/, 5], [/стационар/i, 6], [/краткосрочн/i, 7], [/долгосрочн/i, 7], [/золот/i, 11],
                 [/единиц\S* эффективного труда/i, 12]].map(([re, n]) => [re.source, re.flags, n]);
  const noBtn = [], unlinked = [];
  for (let i = 0; i < PN4; i++){
    await ev(i=>document.querySelector('[data-p="' + i + '"]').click(), i); await p.waitForTimeout(350);
    const r = await ev(T => {
      const d = document.querySelector('#solution details'); if (d) d.open = true;
      const at = d && d.querySelector('summary + .kons-at [data-kn="0"]');
      const out = [];
      const steps = [...document.querySelectorAll('#solution .why .mini > li')];
      T.forEach(([src, fl, n]) => {
        const re = new RegExp(src, fl);
        for (const li of steps){
          const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
          let node, hit = null;
          while ((node = w.nextNode())) if (re.test(node.textContent)){ hit = node; break; }
          if (hit){ const a = hit.parentElement.closest('.kref');
            if (!a || +a.dataset.kn !== n) out.push({термин: src, шаг: li.textContent.slice(0, 60), ссылка: a && a.dataset.kn});
            break; }
        }
      });
      return {btn: !!at, out};
    }, TERMS);
    if (!r.btn) noBtn.push(i + 1);
    r.out.forEach(x => unlinked.push({задача: i + 1, ...x}));
  }
  ok('Р11: в начале каждого разбора — кнопка «Конспект»', noBtn.length === 0, noBtn);
  ok('Р11: первое упоминание термина в разборе — ссылка на свой пункт', unlinked.length === 0, unlinked.slice(0, 5));
  if (kb.dlg){
    await ev(()=>document.querySelector('[data-p="0"]').click()); await p.waitForTimeout(350);
    await ev(()=>{ document.querySelector('#solution details').open = true; });
    const ln = p.locator('#solution .kref[data-kn="6"]').first();
    await ln.scrollIntoViewIfNeeded(); await ln.click(); await p.waitForTimeout(300);
    const hit6 = await ev(()=>{ const d = document.getElementById('kons'), li = document.getElementById('kn-6');
      const dr = d.getBoundingClientRect(), lr = li.getBoundingClientRect();
      return {open: d.open, hit: li.classList.contains('kn-hit'), seen: lr.top >= dr.top && lr.top < dr.bottom - 40,
              hash: location.hash.indexOf('kn-') < 0}; });
    ok('Р11: ссылка из разбора открывает свой пункт и не трогает ссылку страницы', Object.values(hit6).every(Boolean), hit6);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  }
  /* на телефоне — во весь экран */
  await m.goto(BASE, {waitUntil:'networkidle'}); await m.waitForTimeout(400);
  const kph = await m.evaluate(async ()=>{ const b = document.querySelector('.toprow > [data-kn="0"]');
    if (!b) return null; b.click(); await new Promise(r=>setTimeout(r, 250));
    const d = document.getElementById('kons'), r = d.getBoundingClientRect();
    const out = {w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, x: r.left, y: r.top};
    d.close(); return out; });
  ok('Р11: на телефоне «Конспект» во весь экран', !!kph && kph.w >= kph.vw - 1 && kph.h >= kph.vh - 1 && kph.x <= 0.5 && kph.y <= 0.5, kph);

  // ---- W4-01: какое значение нарисовано — одно и то же число везде ----
  const H5 = '#p=4&b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1';
  await go(H5); await reveal();
  const w401 = await ev(()=>{
    const fk = forkCase(), f3 = v => v.toFixed(3).replace('.', ',');
    const d = fk.cases.map(c => f3(c.vals.d));
    const drawnLi = [...document.querySelectorAll('#ol1 li')].find(li => /нарисован/.test(li.textContent));
    return {d, cap: [1, 2].map(i => document.getElementById('cap' + i).textContent),
            li: drawnLi ? drawnLi.textContent : null,
            ro: (document.getElementById('ro-note') || {textContent: ''}).textContent};
  });
  ok('W4-01: подпись случая называет, при каком δ он нарисован',
     w401.cap[0].indexOf('δ = ' + w401.d[0]) >= 0 && w401.cap[1].indexOf('δ = ' + w401.d[1]) >= 0, w401);
  ok('W4-01: у исхода «(нарисован)» — нарисованное значение, а не середина области',
     !!w401.li && w401.li.indexOf('δ = ' + w401.d[0]) >= 0, w401.li);
  ok('W4-01: «Показатели» на развилке называют калибровку каждой диаграммы',
     w401.ro.indexOf('δ = ' + w401.d[0]) >= 0 && w401.ro.indexOf('δ = ' + w401.d[1]) >= 0, w401.ro);
  await go('#p=1&b=s:0.1:1,d:0.1:1,n:0:1,g:0:1,a:0.3333333333333333:0&k=s:set:0.2:1;d:set:0.12:1'); await reveal();
  const w401b = await ev(()=>{ const li = [...document.querySelectorAll('#ol1 li')].find(li => /нарисован/.test(li.textContent));
    return li ? li.textContent : null; });
  ok('W4-01: и на одиночной диаграмме — α = 0,333, при котором она нарисована', !!w401b && /α = 0,333/.test(w401b), w401b);

  // ---- W4-02, W4-14: слипшиеся линии названы, и приблизить можно пальцем ----
  const H6 = '#p=5&b=s:0.2:0,d:0.05:1,n:0:1,g:0:1,a:0.4:1&k=n:set:0.02:1;a:set:0.35:1';
  await m.goto(BASE + H6, {waitUntil:'networkidle'}); await m.waitForTimeout(700);
  const t0 = await m.evaluate(()=>{ const e = document.getElementById('tight1'), b = e && e.querySelector('button');
    return {vis: !!e && !e.hidden, txt: e ? e.textContent.replace(/\s+/g, ' ') : '', btn: !!b && !b.hidden}; });
  ok('W4-14: заметка называет, какие линии слиплись, без «рамки»',
     t0.vis && /(кривая выпуска|кривая инвестиций|линия выбытия)/i.test(t0.txt) && !/рамк/.test(t0.txt), t0.txt.slice(0, 160));
  let t1 = {tapped: false};
  if (t0.btn){
    await m.evaluate(()=>document.getElementById('tight1').scrollIntoView({block:'center'})); await m.waitForTimeout(200);
    await m.tap('#tight1 button'); await m.waitForTimeout(500);
    t1 = await m.evaluate(()=>({tapped: true, view: !!PANE.main.view, apart: PANE.main.apart,
      vis: !document.getElementById('tight1').hidden}));
  }
  ok('W4-02: на телефоне кнопка приближает слипшиеся линии — они расходятся, и заметка уходит',
     t0.btn && t1.tapped && t1.view && t1.apart >= 16 && !t1.vis, {t0, t1});
  // ---- W4: тексты разборов и «Конспекта» ----
  const txt4 = await ev(()=>PROBLEMS.map(q => [q.ask].concat(q.why.map(w => [].concat(w[1]).join(' ') + ' ' + w[2]))
    .join(' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#8722;/g, '−').replace(/&#8594;/g, '→')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ')));
  ok('W4-06: в задаче 2 граница α ≈ 0,187 выведена, и модель с ней согласна',
     /0,187/.test(txt4[1]) && /ln 1,875/.test(txt4[1]) &&
     (await lastLR('#b=s:0.1:1,d:0.1:1,n:0:1,g:0:1,a:0.185:1&k=s:set:0.2:1;d:set:0.12:1')) === '↑↑↓↑' &&
     (await lastLR('#b=s:0.1:1,d:0.1:1,n:0:1,g:0:1,a:0.19:1&k=s:set:0.2:1;d:set:0.12:1')) === '↑↑↑↑');
  ok('W4-03: разбор выводит строку δ и строку s, а не берёт их из закрытой таблицы',
     !txt4.some(t => /таблица краткосрочно даёт|Строка δ в таблице краткосрочно|Строка s таблицы долгосрочно даёт/.test(t)));
  ok('W4-08, W4-09: в задаче про s и α промежуточные шаги цепочки и порога выписаны',
     /1,1 · k₀0,70 = knew0,65/.test(txt4[4]) && /k₀0,05 < 1,1−0,35/.test(txt4[4]) && /0,98324/.test(txt4[4]), txt4[4].match(/.{0,40}k₀0,70.{0,40}/));
  const kt4 = await ev(()=>{ const d = document.getElementById('kons'); return d ? d.textContent.replace(/\s+/g, ' ') : ''; });
  ok('W4-04: «Конспект» — скачок бывает и от s и α, и что такое kᵢ',
     /прыгают и от s и α/.test(kt4) && /у K и L — сразу, у остальных — в новом стационаре/.test(kt4));
  ok('W4-07: «Конспект» — производственная функция с A·L и y = k^α на единицу эффективного труда',
     /Y = Kα · \(A·L\)1−α/.test(kt4) && /y = Y \/ \(A·L\) = \(K \/ \(A·L\)\)α = kα/.test(kt4));
  ok('W4-05: точка поворота k = 1 не путается с (1; 1) на диаграмме', /Не путайте её с точкой \(1; 1\)/.test(kt4) &&
     await ev(()=>/Это не точка k.=.1/.test(document.getElementById('phelp').textContent.replace(/\s+/g, ' '))));
  ok('W4-12, W4-13: временные и постоянные, Кобб — Дуглас, доля капитала — чего',
     /«временными»/.test(kt4) && /Кобба — Дугласа/.test(kt4) && /достаётся владельцам капитала/.test(kt4));
  ok('W4-15: в задаче 1 сказано, что 25% — это скачок L, а не n', /это не n/.test(txt4[0]));
  ok('ошибок на странице нет', errs.length === 0, errs);
  await b.close();
  const fails = R.filter(x=>x[0]==='FAIL');
  R.forEach(x=>console.log(x[0].padEnd(5), x[1], x[2] ? '  '+x[2].slice(0,110) : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

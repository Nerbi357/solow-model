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
  ok('K4: α падает — текст говорит о падении α', /падение α/.test(lead5) && !/рост α/.test(lead5), lead5.slice(60, 170));
  await go('#b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1');
  ok('K4: α растёт — текст говорит о росте α', /рост α/.test(await ev(()=>document.getElementById('forklead').textContent)));
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
                         ['задача 4, ось y', '#b=s:0.2:1,d:0.1:0,n:0:1,g:0:1,a:0.3:1&k=s:set:0.22:1;a:set:0.35:1'],
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
  for (let i = 0; i < 5; i++){
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

  ok('ошибок на странице нет', errs.length === 0, errs);
  await b.close();
  const fails = R.filter(x=>x[0]==='FAIL');
  R.forEach(x=>console.log(x[0].padEnd(5), x[1], x[2] ? '  '+x[2].slice(0,110) : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

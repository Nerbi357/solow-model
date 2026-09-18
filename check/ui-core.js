/* Ядро: модель, диапазоны, формы шока, точки, ссылка, PNG, узкий экран
 *
 * Запуск: node check/ui-core.js   (нужен playwright и python3 -m http.server 8000)
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
const fs = require('fs'), os = require('os'), pathmod = require('path');
const TMP = fs.mkdtempSync(pathmod.join(os.tmpdir(), 'solow-'));
const EXE = process.env.CHROME_PATH || undefined;
const BASE = process.env.URL || 'http://localhost:8000/';
const R = []; const ok = (n, c, x) => R.push([c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)]);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1250 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const net = [];
  p.on('request', r => { if (!r.url().startsWith(BASE)) net.push(r.url()); });
  const ev = (fn, a) => p.evaluate(fn, a);
  const loadP = async i => { await ev(i => document.querySelector(`[data-p="${i}"]`).click(), i); await p.waitForTimeout(320); };
  /* ответ в таблице теперь закрыт по умолчанию — тесты его открывают */
  const show = async () => { await ev(()=>{
    const b = document.getElementById('reveal');
    if (b && !b.disabled && b.getAttribute('aria-pressed') !== 'true') b.click();
  }); await p.waitForTimeout(260); };
  const tbl = async () => { await show(); return ev(() => [...document.querySelectorAll('#fx tr')]
    .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent).join(''))); };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);

  // ---- 1. CES убран, Кобб — Дуглас ----
  ok('CES и σ убраны', await ev(() =>
     typeof sGold === 'function' && !('sg' in dispVals()) && !document.getElementById('b-sg')));
  ok('f(k) = k^α', await ev(() => Math.abs(f(8, {a:1/3}) - 2) < 1e-12));
  ok('k* = (s/(δ+n+g))^(1/(1−α))', await ev(() =>
     Math.abs(kStar({s:.2,d:.1,n:0,g:0,a:1/3}) - Math.pow(2, 1.5)) < 1e-12));

  // ---- 2. диапазоны и ввод числом ----
  const rng = await ev(() => ['s','d','n','g','a'].map(k => ({k, min:+document.getElementById('b-'+k).min, max:+document.getElementById('b-'+k).max})));
  ok('s, δ, α: 0,01–0,99', rng.filter(r=>['s','d','a'].includes(r.k)).every(r=>r.min===0.01&&r.max===0.99), rng);
  ok('n, g достают до нуля', rng.filter(r=>['n','g'].includes(r.k)).every(r=>r.min===0&&r.max===0.99), rng);
  const box = async (id,v) => { await ev(([id,v])=>{const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));},[id,v]); await p.waitForTimeout(260); };
  await box('nb-s','0,42'); ok('ячейка принимает запятую', Math.abs(await ev(()=>base.s.v)-0.42)<1e-9);
  await box('nb-s','9');    ok('ячейка клампит', (await ev(()=>base.s.v))===0.99);
  await box('nb-s','ерунда'); ok('мусор не применяется', (await ev(()=>base.s.v))===0.99);
  ok('мусор подсвечен', await ev(()=>document.getElementById('nb-s').classList.contains('bad')));
  await box('nb-s','0,20');

  // ---- 3. три формы шока ----
  await ev(()=>{document.getElementById('addsel').value='d';document.getElementById('add').click();});
  await p.waitForTimeout(280);
  ok('вкладки формы подписаны словами', await ev(()=>
     [...document.querySelectorAll('.ftabs button')].map(b=>b.textContent.trim()).join('|')
       === '→новое|+на сколько|×во сколько'),
     await ev(()=>[...document.querySelectorAll('.ftabs button')].map(b=>b.textContent.trim())));
  ok('кнопка golden rule стоит в шапке графика', await ev(()=>!!document.querySelector('.phead #goldbtn')));
  ok('текст про короткий период убран', await ev(()=>!document.getElementById('phase')));
  ok('у параметра доступны все три формы', await ev(()=>
     [...document.querySelectorAll('.ftabs [data-form]')].map(x=>x.dataset.form).join()==='set,add,mul'));
  await ev(()=>document.querySelector('.ftabs [data-form="add"]').click()); await p.waitForTimeout(280);
  ok('смена формы сбрасывает значение в нейтральное',
     await ev(()=>shocks[0].form==='add' && shocks[0].value===0));
  ok('нейтральный шок ничего не красит', await ev(()=>active().length===0));
  await ev(()=>{const e=document.getElementById('k0-d');e.value=0.05;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForTimeout(320);
  ok('приращение в пунктах работает', await ev(()=>{
     const P=paramsOf(shocks[0]); return Math.abs(P.d-(base.d.v+0.05))<1e-12; }));
  ok('подпись шока — «δ + 0,050»', (await ev(()=>shockName(shocks[0]))).includes('+'), await ev(()=>shockName(shocks[0])));

  // ---- 4. максимум три шока, один параметр — один шок ----
  await ev(()=>{['s','a'].forEach(k=>{document.getElementById('addsel').value=k;document.getElementById('add').click();});});
  await p.waitForTimeout(350);
  ok('добавились три шока', await ev(()=>shocks.length===3));
  ok('четвёртый шок не добавить', await ev(()=>document.getElementById('add').disabled));
  ok('занятый параметр исчез из списка', await ev(()=>
     [...document.querySelectorAll('#addsel option')].every(o=>!['d','s','a'].includes(o.value))));

  // ---- 5. «задано / свободно» ----
  await loadP(1);                                        // листок 1.ii: свободно только α
  ok('задача расставляет статусы сама', await ev(()=>
     JSON.stringify(freeKeys())==='["a"]' && base.s.fixed && base.d.fixed), await ev(()=>freeKeys()));
  const beforeFree = await tbl();
  await ev(()=>{const e=document.getElementById('b-a');e.value=0.7;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForTimeout(450);
  ok('свободный параметр двигает картинку, но не таблицу',
     JSON.stringify(await tbl())===JSON.stringify(beforeFree), {before:beforeFree, after:await tbl()});
  await ev(()=>document.querySelector('[data-pin="a"]').click());
  await p.waitForTimeout(450);
  ok('«задано» превращает «?» в конкретную стрелку', await ev(()=>{
     const t=[...document.querySelectorAll('#fx tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent).join(''));
     return !t.some(r=>r.includes('?')); }), await tbl());
  await loadP(1); await show();

  // ---- 6. задачи против независимого расчёта ----
  const EXPECT = {
    0: {rows:['↓↓↓↓====','↓↓↓↓====','↓↓↓↓===='], free:['s','d','a']},
    1: {rows:['==↓↑↑↑?↑','====↓↓↓↓','==↓↑↑↑?↑'], free:['a']},
    2: {rows:['↑↑↑↑====','====↓↓↓↓','↑↑↑↑↓↓↓↓'], free:['s','d','a']},
    3: {rows:['==↓↑↑↑↑↑','?=??????','?=??????'], free:['d']},
    4: {rows:['====↓↓↓↓','?=??????','?=???↓??'], free:['s']}
  };

  for (const [i, exp] of Object.entries(EXPECT)){
    await loadP(+i);
    const got = await tbl(), free = await ev(()=>freeKeys());
    const title = await ev(()=>PROBLEMS[probIdx].title);
    ok('таблица верна: ' + title, JSON.stringify(got)===JSON.stringify(exp.rows), {got, exp:exp.rows});
    ok('свободные верны: ' + title, JSON.stringify(free)===JSON.stringify(exp.free), {free, exp:exp.free});
  }

  // ---- 7. пороги под таблицей ----
  await loadP(1); await show();
  const notes = await ev(()=>document.getElementById('notes').textContent.replace(/\s+/g,' '));
  /* Пороги убраны: при нескольких свободных параметрах число было верно
     только для одной случайной калибровки, а выглядело как ответ. */
  ok('под таблицей нет выдуманных порогов', !/растёт при|падает при/.test(notes), notes.slice(0,160));
  await loadP(3); await show();
  const n3 = await ev(()=>document.getElementById('notes').textContent.replace(/\s+/g,' '));
  ok('и в задаче со сплошными «?» их тоже нет', n3.trim() === '', n3.slice(0,160));

  // ---- 8. график: перпендикуляры, стрелки, скобка ----
  await loadP(0);
  ok('перпендикуляры и точки на всех пересечённых линиях',
     await ev(()=>pointList().length >= 6), await ev(()=>pointList().length));
  await loadP(1); await show();
  ok('на оси ровно four перпендикуляра: old, k₁, k₂, new',
     JSON.stringify(await ev(()=>statesOf().filter(s=>s.axis).map(s=>s.mark)))==='["old","k₁","k₂","new"]',
     await ev(()=>statesOf().filter(s=>s.axis).map(s=>s.mark)));
  ok('скобки убраны обе', await ev(()=>typeof bracket === 'undefined'));
  ok('абзаца под заголовком нет', await ev(()=>!document.querySelector('.masthead .lead')));
  ok('golden rule прячется по кнопке', await ev(()=>{
     const t = legendItems(statesOf()).map(i=>i.t).join(' ');
     return !showGold && !t.includes('golden rule'); }));
  await p.locator('#goldbtn').click(); await p.waitForTimeout(300);
  ok('кнопка показывает golden rule', await ev(()=>{
     const t = legendItems(statesOf()).map(i=>i.t).join(' ');
     return showGold && t.includes('golden rule') && !t.includes('золотое правило'); }));
  await p.locator('#goldbtn').click(); await p.waitForTimeout(300);
  ok('кнопка прячет golden rule обратно', await ev(()=>!showGold));

  // ---- зум ----
  {
    const bb0 = await p.locator('#main').boundingBox();
    await p.mouse.move(bb0.x+bb0.width*0.45, bb0.y+bb0.height*0.78);
    for (let i=0;i<5;i++){ await p.mouse.wheel(0,-120); await p.waitForTimeout(60); }
    ok('колесо приближает', await ev(()=>!!view && view.k1-view.k0 < autoFrame.k1-autoFrame.k0),
       await ev(()=>view));
    ok('кнопка сброса масштаба появилась', await ev(()=>!document.getElementById('zoomreset').hidden));
    const v1 = await ev(()=>({...view}));
    await p.mouse.move(bb0.x+600, bb0.y+400); await p.mouse.down();
    await p.mouse.move(bb0.x+490, bb0.y+440, {steps:6}); await p.mouse.up();
    await p.waitForTimeout(200);
    ok('перетаскивание сдвигает окно', await ev(v=>view.k0 !== v.k0, v1), await ev(()=>view));
    await p.locator('#zoomreset').click(); await p.waitForTimeout(220);
    ok('сброс возвращает авто', await ev(()=>view===null));
  }

  // ---- значение шока в шапке карточки ----
  await loadP(1); await show();
  await ev(()=>{const e=document.getElementById('k0-s');e.value=0.55;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForTimeout(320);
  ok('шапка карточки шока показывает актуальное значение',
     (await ev(()=>document.querySelector('[data-head="0"]').textContent)).includes('0,550'),
     await ev(()=>document.querySelector('[data-head="0"]').textContent));

  // ---- сброс исходного состояния ----
  await ev(()=>{const e=document.getElementById('b-s');e.value=0.77;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.waitForTimeout(300);
  await p.locator('#basereset').click(); await p.waitForTimeout(300);
  ok('кнопка «Сбросить» возвращает исходное состояние задачи',
     Math.abs(await ev(()=>base.s.v) - 0.10) < 1e-9, await ev(()=>base.s.v));
  await loadP(1); await show();

  // ---- 9. точки и координаты ----
  const hits = await ev(()=>HITS.map(h=>({id:h.id,x:h.x,y:h.y})));
  const bb = await p.locator('#main').boundingBox();
  const click = async id => { const h = hits.find(x=>x.id===id); await p.mouse.click(bb.x+h.x+1, bb.y+h.y+1); await p.waitForTimeout(220); };
  await click('base-out');
  ok('щелчок отмечает точку', await ev(()=>picked.length===1), await ev(()=>picked));
  ok('исходный стационар — это (1; 1)', await ev(()=>{
     const q=pointList().find(x=>x.id==='base-out'), r=relOf(q);
     return Math.abs(r.k-1)<1e-12 && Math.abs(r.y-1)<1e-12; }));
  const second = hits.find(h=>h.id!=='base-out' && h.id.endsWith('-out'));
  await p.mouse.click(bb.x+second.x+1, bb.y+second.y+1); await p.waitForTimeout(240);
  const cells = await ev(()=>[...document.querySelectorAll('#coords-body tbody tr')]
    .map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.trim())));
  ok('вторая точка сравнивается с первой по Δk и Δy',
     cells.length===2 && /^[+−]/.test(cells[1][3]) && /^[+−]/.test(cells[1][4]), cells);
  ok('показана именно разница, а не отношение',
     !cells[1][3].includes('×') && !cells[1][3].includes('%'), cells[1]);
  await click('base-out');
  ok('повторный щелчок снимает отметку', await ev(()=>picked.length===1));
  await p.locator('#clearpts').click(); await p.waitForTimeout(200);
  ok('кнопка снимает все отметки', await ev(()=>picked.length===0));
  await p.locator('#main').focus();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(220);
  ok('точки доступны с клавиатуры', await ev(()=>picked.length===1));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('Escape снимает отметки', await ev(()=>picked.length===0));

  // ---- 10. ссылка ----
  await loadP(2);
  await p.waitForTimeout(400);
  const h = await ev(()=>location.hash);
  ok('ссылка несёт базу, статусы, шоки и задачу',
     ['v=4','b=','k=','p='].every(x=>h.includes(x)) && h.includes(':0') && h.includes(':1'), h);
  const p2 = await ctx.newPage();
  const e2 = []; p2.on('pageerror', e=>e2.push(e.message));
  await p2.goto(BASE + h, { waitUntil:'networkidle' }); await p2.waitForTimeout(500);
  const snap = pg => pg.evaluate(()=>({base:JSON.parse(JSON.stringify(base)), shocks:shocks.map(s=>({...s})), probIdx}));
  ok('ссылка восстанавливает всё', JSON.stringify(await snap(p2))===JSON.stringify(await snap(p)),
     {back:await snap(p2), orig:await snap(p)});
  ok('восстановленная страница без ошибок', e2.length===0, e2);
  await p2.goto(BASE + '#v=4&b=s:9:1,d:-4:0,a:9:1&k=s:set:9:1;s:set:.3:1;zz:set:1:1;d:mul:2:1;n:add:.1:1&p=99', {waitUntil:'networkidle'});
  await p2.waitForTimeout(400);
  const junk = await p2.evaluate(()=>({s:base.s.v, d:base.d.v, a:base.a.v, dfix:base.d.fixed,
    n:shocks.length, keys:shocks.map(x=>x.key), probIdx}));
  ok('мусор в ссылке клампится, дубликаты и лишнее отбрасываются',
     junk.s===0.99 && junk.d===0.01 && junk.a===0.99 && junk.dfix===false &&
     junk.n===3 && junk.keys.join()==='s,d,n' && junk.probIdx===-1, junk);
  ok('мусорная ссылка ничего не роняет', e2.length===0, e2);
  await p2.close();

  // ---- 11. PNG ----
  const dl = p.waitForEvent('download', {timeout:9000});
  await p.locator('#png').click();
  const d = await dl;
  const path = pathmod.join(TMP, 'export.png');
  await d.saveAs(path);
  const buf = fs.readFileSync(path);
  const css = await ev(()=>{const c=document.getElementById('main');
    return {w:c.clientWidth, h:+(c.dataset.hNow || c.dataset.h)};});
  ok('PNG — белый фон, ×2', buf.readUInt32BE(16)===css.w*2 && buf.readUInt32BE(20)===css.h*2,
     {w:buf.readUInt32BE(16), h:buf.readUInt32BE(20), css});

  // ---- 12. отзывчивость ползунка ----
  await loadP(0);                                    // три свободных — самый тяжёлый перебор
  const t0 = Date.now();
  for (let i = 0; i < 12; i++){
    await ev(v=>{const e=document.getElementById('b-n');e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}, 0.01*i);
  }
  const dt = Date.now() - t0;
  ok('перетаскивание не спотыкается (12 шагов < 1,2 с)', dt < 1200, dt + 'ms');

  // ---- 13. мобильный, фокус, dpr ----
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(450);
  ok('нет горизонтальной прокрутки на 390px',
     await ev(()=>document.documentElement.scrollWidth<=window.innerWidth+1),
     await ev(()=>[document.documentElement.scrollWidth, window.innerWidth]));
  await p.setViewportSize({width:1600,height:1250}); await p.waitForTimeout(400);
  ok('все контролы доступны с клавиатуры', await ev(()=>
     [...document.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled])')]
       .filter(el=>!el.hidden && el.offsetParent!==null && !el.disabled)
       .every(el=>{el.focus();return document.activeElement===el;})));
  ok('canvas учитывает devicePixelRatio', await ev(()=>{
     const c=document.getElementById('main');
     return Math.abs(c.width/c.clientWidth - devicePixelRatio) < 0.01; }));
  ok('внешних запросов нет', net.length===0, net);
  ok('ошибок в консоли нет', errs.length===0, errs);

  await loadP(3); await show();
  await b.close();

  const fails = R.filter(r=>r[0]==='FAIL');
  R.forEach(r=>console.log(r[0].padEnd(5), r[1], r[2] ? '  '+r[2].slice(0,190) : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

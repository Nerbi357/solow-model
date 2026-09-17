/* Запрет «→ новое», границы «+» и «×», сужение перебора
 *
 * Запуск: node check/ui-locks.js   (нужен playwright и python3 -m http.server 8000)
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
const R = []; const ok = (n, c, x) => R.push([c ? 'PASS' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)]);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1250 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const ev = (fn, a) => p.evaluate(fn, a);
  const wait = ms => p.waitForTimeout(ms === undefined ? 320 : ms);
  /* ответ в таблице теперь закрыт по умолчанию — тесты его открывают */
  const show = async () => { await ev(()=>{
    const b = document.getElementById('reveal');
    if (b && !b.disabled && b.getAttribute('aria-pressed') !== 'true') b.click();
  }); await p.waitForTimeout(260); };
  const tbl = async () => { await show(); return ev(() => [...document.querySelectorAll('#fx tr')]
    .filter(tr => tr.querySelectorAll('td').length > 1)
    .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()).join(''))); };
  const notes = async () => { await show(); return ev(() => document.getElementById('notes').textContent); };
  const addShock = async (key, form, value) => {
    await ev(([key,form,value]) => {
      document.getElementById('addsel').value = key;
      document.getElementById('add').click();
      const i = shocks.length - 1;
      if (form) document.querySelector('[data-fscope="k'+i+'-"][data-form="'+form+'"]').click();
      if (value !== null){
        const n = document.getElementById('nk'+i+'-'+key);
        n.value = String(value).replace('.', ',');
        n.dispatchEvent(new Event('change', {bubbles:true}));
      }
    }, [key, form, value]);
    await wait();
  };
  const reset = async () => { await p.goto(BASE + '#', {waitUntil:'networkidle'}); await ev(()=>{location.hash='';}); await p.reload({waitUntil:'networkidle'}); await wait(420); };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await wait(500);
  PROBN = await ev(()=>PROBLEMS.length);

  /* ============ 0. пустая страница молчит ============ */
  ok('без шоков под таблицей пусто', (await notes()).trim() === '', (await notes()).slice(0,120));
  ok('и никакой «Модель не определена»', (await notes()).indexOf('не определена') < 0);
  await ev(()=>{ document.getElementById('addsel').value='s'; document.getElementById('add').click(); });
  await wait();
  ok('свежий шок на нейтральном значении тоже молчит',
     (await notes()).trim() === '', (await notes()).slice(0,120));
  await ev(()=>{ document.querySelector('[data-del="0"]').click(); }); await wait();

  /* ============ 1. сценарий, на котором споткнулся пользователь ============ */
  /* по умолчанию α свободна, s задана — шок «s → 0,25» должен давать
     осмысленную таблицу, а не сплошные «?» */
  await ev(()=>{ base.s.fixed = false; refreshAll(); }); await wait();
  ok('исходно s можно сделать свободной', await ev(()=>base.s.fixed) === false);
  await addShock('s', 'set', 0.60);
  ok('шок «s → новое» запер исходную s', await ev(()=>base.s.fixed) === true);
  ok('кнопка «задано» у s заперта', await ev(()=>document.querySelector('[data-pin="s"]').disabled));
  ok('щелчок по запертой кнопке ничего не меняет', await (async () => {
      await ev(()=>document.querySelector('[data-pin="s"]').click()); await wait(200);
      return await ev(()=>base.s.fixed) === true; })());
  const t1 = await tbl();
  /* α по умолчанию свободна, поэтому «?» у c в длинном периоде — правильный
     ответ, а не вырождение: порог по α инструмент называет отдельно. */
  ok('таблица про s 0,50 → 0,60 больше не вырождается в сплошные «?»',
     t1.length === 1 && t1[0] === '==↓↑↑↑?↑', t1);
  ok('и «?» ровно один — у c в длинном периоде',
     (t1[0].match(/\?/g) || []).length === 1, t1);
  ok('порогов под таблицей нет — они врали бы точностью',
     !/растёт при|падает при/.test(await notes()), (await notes()).slice(0, 160));
  ok('в карточке шока написано, почему s заперта',
     (await ev(()=>document.querySelector('.cbody .touch').textContent)).indexOf('держится заданным') > 0,
     await ev(()=>document.querySelector('.cbody .touch').textContent));

  /* ============ 2. обратно: убрали шок — запрет снялся ============ */
  await ev(()=>{ document.querySelector('[data-del="0"]').click(); }); await wait();
  ok('после удаления шока кнопка снова живая',
     await ev(()=>!document.querySelector('[data-pin="s"]').disabled));
  ok('и запрет снялся сам: s снова свободна', await ev(()=>base.s.fixed) === false);

  /* смена формы тоже обязана отпускать параметр */
  await addShock('s', 'set', 0.60);
  ok('форма «новое» снова заперла s', await ev(()=>base.s.fixed) === true);
  await ev(()=>{ document.querySelector('[data-fscope="k0-"][data-form="mul"]').click(); }); await wait();
  ok('переключили на «×» — s отпустило', await ev(()=>base.s.fixed) === false);

  /* а руками поставленное «задано» снимать нельзя */
  await ev(()=>{ document.querySelector('[data-del="0"]').click(); }); await wait();
  await ev(()=>{ document.querySelector('[data-pin="d"]').click(); }); await wait();
  const dWasFixed = await ev(()=>base.d.fixed);
  await addShock('d', 'set', 0.15);
  await ev(()=>{ document.querySelector('[data-fscope="k0-"][data-form="add"]').click(); }); await wait();
  ok('статус, поставленный человеком, шок не трогает',
     await ev(()=>base.d.fixed) === dWasFixed, {dWasFixed, now: await ev(()=>base.d.fixed)});

  /* ============ 3. «+ на сколько» не выводит заданный параметр за границы ============ */
  await reset();
  await ev(()=>{ base.n.v = 0; base.n.fixed = true; refreshAll(); }); await wait();
  await addShock('n', 'add', -0.03);
  const nv = await ev(()=>shocks[0].value);
  ok('шок «n + (−0,03)» при заданной n = 0 подрезан до нуля', Math.abs(nv) < 1e-12, nv);
  ok('границы ползунка шока совпадают с допустимыми',
     await ev(()=>{ const r=document.getElementById('k0-n'); return +r.min===0 && Math.abs(+r.max-0.99)<1e-9; }),
     await ev(()=>{ const r=document.getElementById('k0-n'); return [r.min, r.max]; }));

  /* ============ 4. свободный параметр: сужение названо вслух ============ */
  await reset();
  await ev(()=>{ base.n.fixed = false; refreshAll(); }); await wait();
  await addShock('n', 'add', 0.5);
  ok('после смены формы на «+» n осталась свободной', await ev(()=>base.n.fixed) === false);
  const nt = await notes();
  ok('при свободной n шок «+0,5» разрешён', Math.abs(await ev(()=>shocks[0].value) - 0.5) < 1e-9);
  ok('страница говорит, что перебор сужен', nt.indexOf('Перебор сужен') >= 0, nt.slice(0, 220));
  ok('и называет отрезок: n + 0,5 осмысленна лишь при n < 0,5',
     /n от 0,000 до 0,50\d?/.test(nt), nt.slice(0, 220));

  /* ============ 5. «модель не определена» — если довести до этого ============ */
  await reset();
  await ev(()=>{
    base = {s:{v:.2,fixed:true}, d:{v:.1,fixed:true}, n:{v:0,fixed:true}, g:{v:0,fixed:true}, a:{v:1/3,fixed:true}};
    shocks = [{key:'n', form:'add', value:-0.03, on:true, ci:0}];   // мимо UI, нарочно
    sweepCache = {key:null,val:null,stat:null};
    revealed = true;
    renderNotes();
  }); await wait();
  const dt = await notes();
  ok('нелегальное состояние объяснено, а не молчит', dt.indexOf('Модель не определена') >= 0, dt.slice(0,200));
  ok('и не выдаётся за «зависит от свободных»', dt.indexOf('свободные параметры') < 0, dt.slice(0,200));

  /* ============ 6. задачи не поехали ============ */
  await reset();
  const EXP = [
    ['Задача 1', ['↓↓↓↓====','↓↓↓↓====','↓↓↓↓====']],
    ['Задача 2', ['==↓↑↑↑?↑','====↓↓↓↓','==↓↑↑↑?↑']],
    ['Задача 3', ['↑↑↑↑====','====↓↓↓↓','↑↑↑↑↓↓↓↓']],
    ['Задача 4', ['==↓↑↑↑↑↑','?=??????','?=??????']],
    ['Задача 5', ['====↓↓↓↓','?=??????','?=???↓??']]
  ];
  for (let i = 0; i < PROBN; i++){
    await ev(i => document.querySelector('[data-p="'+i+'"]').click(), i);
    await wait(420);
    const t = await tbl();
    ok('задача ' + EXP[i][0] + ' — таблица прежняя', JSON.stringify(t) === JSON.stringify(EXP[i][1]),
       {got: t, exp: EXP[i][1]});
    const n = await notes();
    ok('задача ' + EXP[i][0] + ' — лишних жалоб нет',
       n.indexOf('Модель не определена') < 0 && n.indexOf('Перебор сужен') < 0, n.slice(0,140));
  }

  /* ============ 7. базовый ползунок подрезает шок на лету ============ */
  await reset();
  await ev(()=>{ base.d.v = 0.10; base.d.fixed = true; refreshAll(); }); await wait();
  await addShock('d', 'add', -0.09);
  ok('шок «δ − 9 п.п.» при δ = 0,10 допустим', Math.abs(await ev(()=>shocks[0].value) + 0.09) < 1e-9);
  await ev(()=>{ base.d.v = 0.04; refreshLive(); }); await wait(320);
  const dv = await ev(()=>shocks[0].value);
  ok('сдвинули δ до 0,04 — шок подрезан следом', Math.abs(dv + 0.03) < 1e-9, dv);
  ok('и шапка карточки показывает новое число',
     (await ev(()=>document.querySelector('[data-head="0"]').textContent)).replace(/\s+/g,' ').indexOf('δ − 0,030') >= 0,
     await ev(()=>document.querySelector('[data-head="0"]').textContent));
  ok('таблица при этом осмысленна', (await tbl())[0].indexOf('?') < 0, await tbl());

  ok('ошибок в консоли нет', errs.length === 0, errs);
  await b.close();

  const fails = R.filter(r=>r[0]==='FAIL');
  R.forEach(r=>console.log(r[0].padEnd(5), r[1], r[2] ? '  '+r[2].slice(0,200) : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

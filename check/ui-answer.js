/* Свободные параметры, кнопка «Показать ответ», условие задачи
 *
 * Запуск: node check/ui-answer.js   (нужен playwright и python3 -m http.server 8000)
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
const R = []; const ok = (n,c,x) => R.push([c?'PASS':'FAIL', n, x===undefined?'':JSON.stringify(x)]);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await b.newContext({viewport:{width:1600,height:1250}})).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (f,a) => p.evaluate(f,a);
  const wait = (ms=320) => p.waitForTimeout(ms);
  const cells = () => ev(()=>[...document.querySelectorAll('#fx td.v')].map(t=>t.textContent.trim()));
  const notes = () => ev(()=>document.getElementById('notes').textContent);
  const sol = () => ev(()=>document.getElementById('solution').hidden ? null :
    {mod: !!(document.getElementById('modnote') && !document.getElementById('modnote').hidden)});
  const load = async i => { await ev(i=>document.querySelector('[data-p="'+i+'"]').click(), i); await wait(650); };
  const reset = async () => { await ev(()=>{location.hash='';}); await p.reload({waitUntil:'networkidle'}); await wait(500); };

  await p.goto(BASE, {waitUntil:'networkidle'});
  await wait(600);

  /* --- 1. норма сбережений по умолчанию --- */
  ok('s по умолчанию 0,50', await ev(()=>base.s.v) === 0.5, await ev(()=>base.s.v));
  ok('и пересечение не жмётся к оси', await ev(()=>{
    const pv = dispVals(), k = kStar(pv);
    const g = geom(), h = g.B - g.T;
    let top = 0; ['out','inv','dep'].forEach(c => { top = Math.max(top, curveFn(c, pv)(k*1.45)); });
    return (pv.s * f(k, pv)) / (top * 1.1);           // доля высоты поля
  }) > 0.3, await ev(()=>{
    const pv = dispVals(), k = kStar(pv);
    let top = 0; ['out','inv','dep'].forEach(c => { top = Math.max(top, curveFn(c, pv)(k*1.45)); });
    return +((pv.s * f(k, pv)) / (top * 1.1)).toFixed(3); }));

  /* --- 2. свободный параметр картинку не двигает --- */
  /* Проверяется именно α, поэтому остальные параметры здесь задаются явно:
     по умолчанию свободны все пять. */
  await reset();
  await ev(()=>{ PKEYS.forEach(k => base[k].fixed = true);
                 base.a.v = 1/3; base.a.def = 1/3; refreshAll(); });
  await wait();
  const k1 = await ev(()=>kStar(dispVals()));
  await ev(()=>{ base.a.v = 0.8; refreshLive(); }); await wait();
  const k2 = await ev(()=>kStar(dispVals()));
  ok('заданный параметр картинку двигает', Math.abs(k2 - k1) > 1e-6, {k1, k2});
  await ev(()=>{ document.querySelector('[data-pin="a"]').click(); }); await wait();
  ok('перевели в «свободно» — значение вернулось к иллюстративному',
     Math.abs(await ev(()=>base.a.v) - 1/3) < 1e-9, await ev(()=>base.a.v));
  ok('и ползунок заблокирован', await ev(()=>document.getElementById('b-a').disabled));
  ok('и ячейка тоже', await ev(()=>document.getElementById('nb-a').disabled));
  const k3 = await ev(()=>kStar(dispVals()));
  await ev(()=>{ base.a.v = 0.9; refreshLive(); }); await wait();
  ok('свободный параметр картинку НЕ двигает',
     Math.abs(await ev(()=>kStar(dispVals())) - k3) < 1e-12, {k3, after: await ev(()=>kStar(dispVals()))});
  ok('но в переборе он по-прежнему свободен',
     JSON.stringify(await ev(()=>freeKeys())) === JSON.stringify(['a']), await ev(()=>freeKeys()));
  await reset();
  ok('по умолчанию свободны все пять параметров',
     JSON.stringify(await ev(()=>freeKeys())) === JSON.stringify(['s','d','n','g','a']),
     await ev(()=>freeKeys()));
  ok('и ползунки у них заперты, пока число не задано',
     await ev(()=>PKEYS.every(k => document.getElementById('b-'+k).disabled &&
                                   document.getElementById('nb-'+k).disabled)));
  ok('а показатели прямо говорят, что числа иллюстративные',
     await ev(()=>{ const n = document.getElementById('ro-note');
                    return !n.hidden && /иллюстративн/.test(n.textContent); }));

  /* --- 3. ответ по кнопке --- */
  await reset();
  await load(1);
  ok('до нажатия в таблице пусто', (await cells()).every(c => c === '·'), (await cells()).slice(0,8));
  ok('и порогов под таблицей нет', (await notes()).indexOf('порог') < 0 && (await notes()).trim() === '',
     (await notes()).slice(0,80));
  await ev(()=>document.getElementById('reveal').click()); await wait();
  ok('после нажатия стрелки на месте', (await cells()).some(c => '↑↓=?'.indexOf(c) >= 0), (await cells()).slice(0,8));
  ok('и траектории открылись вместе с ответом',
     await ev(()=>!document.getElementById('pathsblock').hidden));
  await ev(()=>document.getElementById('reveal').click()); await wait();
  ok('кнопка закрывает обратно', (await cells()).every(c => c === '·'));
  ok('без шоков кнопка выключена', await (async()=>{ await reset();
      return ev(()=>document.getElementById('reveal').disabled); })());

  /* --- 4. диагностика видна и без кнопки --- */
  await reset();
  await ev(()=>{ base.n.fixed = false; refreshAll();
    document.getElementById('addsel').value='n'; document.getElementById('add').click();
    const i = shocks.length-1;
    document.querySelector('[data-fscope="k'+i+'-"][data-form="add"]').click();
    const nb = document.getElementById('nk'+i+'-n'); nb.value='0,5';
    nb.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await wait(700);
  ok('«Перебор сужен» виден до нажатия кнопки', (await notes()).indexOf('Перебор сужен') >= 0,
     (await notes()).slice(0,90));
  ok('а порогов при этом нет', (await notes()).indexOf('растёт при') < 0);

  /* --- 5. условие держится за состав шоков --- */
  await reset();
  await load(1);
  ok('задача открыта — условие есть', (await sol()) !== null);
  ok('и пометки «изменено» нет', (await sol()).mod === false);
  await ev(()=>{ const n=document.getElementById('nk0-s'); n.value='0,35';
    n.dispatchEvent(new Event('change',{bubbles:true})); }); await wait(500);
  ok('сдвинули значение — условие осталось', (await sol()) !== null);
  ok('но с пометкой «изменено»', (await sol()).mod === true);
  await ev(()=>{ document.querySelector('[data-fscope="k0-"][data-form="mul"]').click(); }); await wait(450);
  ok('сменили форму — условие всё ещё есть', (await sol()) !== null, await ev(()=>probIdx));
  await ev(()=>{ document.querySelector('[data-del="0"]').click(); }); await wait(450);
  ok('убрали шок — условие исчезло', (await sol()) === null, await ev(()=>probIdx));
  await load(2);
  await ev(()=>{ document.getElementById('addsel').value='n'; document.getElementById('add').click(); });
  await wait(450);
  ok('добавили свой шок — условие исчезло', (await sol()) === null, await ev(()=>probIdx));

  /* --- 6. задачи независимы и переименованы --- */
  const meta = await ev(()=>PROBLEMS.map(q=>({t:q.title, h:problemChanges(q), a:q.ask})));
  ok('заголовки — «Задача N. что куда»',
     meta.every((q,i)=>new RegExp('^Задача ' + (i+1) + '\\. [sδnKLαg] (вверх|вниз), [sδnKLαg] (вверх|вниз)$').test(q.t)),
     meta.map(q=>q.t));
  ok('под заголовком — что и насколько изменилось',
     meta.every(q=>/<b>/.test(q.h) && /(→|×|п\.п\.)/.test(q.h)), meta.map(q=>q.h.replace(/<[^>]+>/g,'')));
  ok('в условиях выделены менявшиеся величины',
     meta.every(q=>(q.a.match(/<b>/g)||[]).length >= 2),
     meta.map(q=>(q.a.match(/<b>/g)||[]).length));
  ok('ни одно условие не ссылается на другую задачу',
     meta.every(q=>!/Та же|листк|задач[еи] \d|выше/i.test(q.a)),
     meta.filter(q=>/Та же|листк|задач[еи] \d|выше/i.test(q.a)).map(q=>q.t));
  ok('каждое условие само называет модель',
     meta.every(q=>q.a.indexOf('Кобба — Дугласа') > 0 && q.a.indexOf('стационарном') > 0),
     meta.filter(q=>!(q.a.indexOf('Кобба — Дугласа') > 0 && q.a.indexOf('стационарном') > 0)).map(q=>q.t));

  /* --- 7. разбор: свой ответ под каждым шагом, и он ни на кого не ссылается --- */
  const why = await ev(()=>PROBLEMS.map(q=>({t:q.title, w:q.why})));
  ok('в разборе три шага, и у каждого свой ответ',
     why.every(q=>q.w.length === 3 && q.w.every(st=>st.length === 3 && st[2].trim().length > 10)),
     why.map(q=>q.w.length + ':' + q.w.map(st=>st.length).join(',')));
  ok('заголовки шагов — те же три вопроса во всех задачах',
     why.every(q=>JSON.stringify(q.w.map(st=>st[0])) === JSON.stringify(
       ['Какие кривые двигаются?', 'Что происходит в краткосрочном периоде?',
        'Что происходит в долгосрочном периоде?'])),
     why.map(q=>q.w.map(st=>st[0])));
  ok('ни один разбор не ссылается на другую задачу',
     why.every(q=>!/Та же задача|листк|задач[еи] \d|как выше|как в предыдущ/i.test(
       q.w.map(st=>st.join(' ')).join(' '))),
     why.filter(q=>/Та же задача|листк|задач[еи] \d|как выше|как в предыдущ/i.test(
       q.w.map(st=>st.join(' ')).join(' '))).map(q=>q.t));
  ok('в разборе нет формулы стационара и слова «запас»',
     why.every(q=>{ const txt = q.w.map(st=>st.join(' ')).join(' ');
                    return !/1\s*[−-]\s*α\s*\)/.test(txt) && !/запас/i.test(txt); }),
     why.filter(q=>{ const txt = q.w.map(st=>st.join(' ')).join(' ');
                     return /1\s*[−-]\s*α\s*\)/.test(txt) || /запас/i.test(txt); }).map(q=>q.t));
  await load(0);
  ok('выкладки в разборе стоят отдельными строками',
     await ev(()=>{ const d = document.querySelector('.solution details');
                    if (d) d.open = true;
                    const c = [...document.querySelectorAll('.why .calc')];
                    return c.length >= 3 && c.every(e=>getComputedStyle(e).display === 'block'); }),
     await ev(()=>document.querySelectorAll('.why .calc').length));
  ok('шаг разбора может занимать несколько абзацев',
     await ev(()=>[...document.querySelectorAll('.why > li')]
       .some(li=>li.querySelectorAll('p:not(.ans)').length > 1)));
  ok('ответ шага назван ответом на странице',
     await ev(()=>{ const d = document.querySelector('.solution details');
                    if (d) d.open = true;
                    const li = [...document.querySelectorAll('.why > li')];
                    return li.length === 3 && li.every(e=>{
                      const a = e.querySelector('.ans');
                      return a && /^Ответ\./.test(a.textContent.trim()); }); }));

  ok('ошибок на странице нет', errs.length === 0, errs);
  await b.close();
  const fails = R.filter(r=>r[0]==='FAIL');
  R.forEach(r=>console.log(r[0].padEnd(5), r[1], r[2] ? '  '+r[2].slice(0,140) : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

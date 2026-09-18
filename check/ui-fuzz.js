/* Перебор конфигураций и случайное блуждание по интерфейсу
 *
 * Запуск: node check/ui-fuzz.js   (нужен playwright и python3 -m http.server 8000)
 * Браузер — CHROME_PATH, адрес — URL. Проще всего: bash check/all.sh
 *
 * Здесь не проверяются числа — для этого есть seminar.py и audit.js. Здесь
 * проверяются инварианты, которые обязаны держаться при любом состоянии:
 * ничего не падает, нигде не появляется NaN, вторая диаграмма совпадает
 * с развилкой, занятый параметр не предлагается второй раз, ответ закрыт
 * до кнопки, ссылка восстанавливает состояние целиком.
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
const R = []; const ok = (n,c,x) => R.push([c?'PASS':'FAIL', n, x===undefined?'':JSON.stringify(x).slice(0,240)]);

let rnd = 20240517;
const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rand() * a.length)];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await b.newContext({viewport:{width:1500,height:1100}});
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const ev = (f,a) => p.evaluate(f,a);
  await p.goto(BASE, {waitUntil:'networkidle'});
  await p.waitForTimeout(500);

  /* ============ 1. перебор конфигураций ============ */
  const BASES = [
    ['всё задано, s>δ',  {s:[.5,1], d:[.1,1], n:[0,1], g:[0,1], a:[1/3,1]}],
    ['всё задано, s<δ',  {s:[.05,1], d:[.3,1], n:[0,1], g:[0,1], a:[1/3,1]}],
    ['s и δ свободны',   {s:[.2,0], d:[.1,0], n:[0,1], g:[0,1], a:[.3,1]}],
    ['всё свободно',     {s:[.2,0], d:[.1,0], n:[0,0], g:[0,0], a:[.3,0]}],
  ];
  const VALUES = {set:[0.01, 0.5, 0.99], add:[-0.5, 0.05, 0.5], mul:[0.05, 1.25, 3]};
  const probe = () => ev(()=>{
    const rows = sweepCached(), act = active(), fk = forkCase();
    return {
      act: act.length, rowsOk: rows.length === (act.length + (act.length>1?1:0)),
      codesOk: rows.every(r => r.sr.concat(r.lr).every(c => ['up','down','same','dunno'].includes(c))),
      fork: !!fk, two: !document.getElementById('fork2').hidden,
      capVis: !!document.getElementById('cap1').offsetParent,
      srY: rows.length ? rows[rows.length-1].sr[0] : null,
      srK: rows.length ? rows[rows.length-1].sr[1] : null,
      stock: act.some(s=>s.key==='K'||s.key==='L'), alpha: act.some(s=>s.key==='a'),
      badText: /NaN|Infinity|undefined/.test(document.body.innerText),
      badValues: shocks.some(s=>!isFinite(s.value)) || PKEYS.some(k=>!isFinite(base[k].v)),
      k0: kStar(dispVals()),
    };
  });
  let n = 0, cfgFail = null, forkFail = null, nanFail = null, srkFail = null;
  for (const [bname, bset] of BASES){
    for (const key of ['s','d','n','g','a','K','L']){
      const forms = await ev(k=>META[k].forms, key);
      for (const form of forms){
        for (const value of VALUES[form]){
          errs.length = 0;
          await ev(cfg => {
            PKEYS.forEach(k => { const [v, fx] = cfg.base[k];
              base[k] = {v: clampKey(k, v), fixed: !!fx, def: clampKey(k, v)}; });
            shocks = [{key: cfg.key, form: cfg.form,
                       value: clampKey(cfg.key, cfg.value, cfg.form), on: true, ci: 0}];
            probIdx = -1; picked = []; revealed = true; zoomReset(); refreshAll();
          }, {base: bset, key, form, value});
          await p.waitForTimeout(190);
          const r = await probe(); n++;
          const tag = bname + ' | ' + key + ' ' + form + ' ' + value;
          if (errs.length && !cfgFail) cfgFail = {tag, errs: errs.slice(0,2)};
          if ((r.badText || r.badValues) && !nanFail) nanFail = {tag};
          if (!r.act) continue;
          if (!r.rowsOk || !r.codesOk) cfgFail = cfgFail || {tag, rows:'плохие строки'};
          if (r.fork !== r.two || (!r.fork && r.capVis)) forkFail = forkFail || {tag, fork:r.fork, two:r.two};
          /* одна картинка не имеет права стоять там, где знак выпуска
             краткосрочно не определён именно из-за стороны от k = 1 */
          if (r.alpha && !r.stock && r.srY === 'dunno' && !r.fork)
            forkFail = forkFail || {tag, why:'SR y = «?» при шоке по α, а диаграмма одна'};
          if (!r.stock && r.srK !== 'same') srkFail = srkFail || {tag, srK:r.srK};
          if (!isFinite(r.k0) || r.k0 <= 0) nanFail = nanFail || {tag, k0:r.k0};
        }
      }
    }
  }
  ok('перебор конфигураций не роняет страницу (' + n + ')', !cfgFail, cfgFail);
  ok('нигде не появляется NaN', !nanFail, nanFail);
  ok('вторая диаграмма ровно там, где развилка', !forkFail, forkFail);
  ok('без шока по запасу k краткосрочно не меняется', !srkFail, srkFail);

  /* ============ 2. случайное блуждание настоящими кликами ============ */
  await ev(()=>{ location.hash=''; }); await p.reload({waitUntil:'networkidle'});
  await p.waitForTimeout(400);
  const act = {
    add: async () => { const free = await ev(()=>[...document.getElementById('addsel').options].map(o=>o.value));
      if (!free.length || await ev(()=>document.getElementById('add').disabled)) return null;
      const k = pick(free);
      await ev(k => { document.getElementById('addsel').value = k; document.getElementById('add').click(); }, k);
      return 'добавить ' + k; },
    del: async () => { const m = await ev(()=>shocks.length); if (!m) return null;
      const i = Math.floor(rand()*m);
      await ev(i => document.querySelector('[data-del="'+i+'"]').click(), i); return 'убрать'; },
    eye: async () => { const m = await ev(()=>shocks.length); if (!m) return null;
      const i = Math.floor(rand()*m);
      await ev(i => document.querySelector('[data-eye="'+i+'"]').click(), i); return 'глаз'; },
    form: async () => { const m = await ev(()=>shocks.length); if (!m) return null;
      const i = Math.floor(rand()*m);
      const fs = await ev(i => [...document.querySelectorAll('[data-fscope="k'+i+'-"]')].map(e=>e.dataset.form), i);
      if (!fs.length) return null; const f = pick(fs);
      await ev(({i,f}) => document.querySelector('[data-fscope="k'+i+'-"][data-form="'+f+'"]').click(), {i,f});
      return 'форма ' + f; },
    box: async () => { const m = await ev(()=>shocks.length); if (!m) return null;
      const i = Math.floor(rand()*m), v = pick(['0,25','-3','abc','7','0.5','','1e3']);
      await ev(({i,v}) => { const sh = shocks[i]; const e = document.getElementById('nk'+i+'-'+sh.key);
        if (e){ e.value = v; e.dispatchEvent(new Event('change',{bubbles:true})); } }, {i,v});
      return 'ячейка ' + v; },
    pin: async () => { const keys = await ev(()=>PKEYS.filter(k=>{
        const e = document.querySelector('[data-pin="'+k+'"]'); return e && !e.disabled; }));
      if (!keys.length) return null; const k = pick(keys);
      await ev(k => document.querySelector('[data-pin="'+k+'"]').click(), k); return 'пин ' + k; },
    slide: async () => { const keys = await ev(()=>PKEYS.filter(k=>{
        const r = document.getElementById('b-'+k); return r && !r.disabled; }));
      if (!keys.length) return null; const k = pick(keys), t = rand();
      await ev(({k,t}) => { const r = document.getElementById('b-'+k);
        r.value = +r.min + (+r.max - +r.min)*t; r.dispatchEvent(new Event('input',{bubbles:true})); }, {k,t});
      return 'ползунок ' + k; },
    prob: async () => { const m = await ev(()=>PROBLEMS.length); const i = Math.floor(rand()*m);
      await ev(i => document.querySelector('[data-p="'+i+'"]').click(), i); return 'задача ' + (i+1); },
    reveal: async () => { await ev(()=>{ const e=document.getElementById('reveal'); if (!e.disabled) e.click(); });
      return 'ответ'; },
    gold: async () => { await ev(()=>document.getElementById('goldbtn').click()); return 'golden'; },
    reset: async () => { await ev(()=>document.getElementById('basereset').click()); return 'сброс'; },
  };
  const names = Object.keys(act);
  let walkFail = null, linkFail = null, uiFail = null, steps = 0;
  for (let step = 0; step < 130; step++){
    errs.length = 0;
    const what = await act[pick(names)]();
    if (!what) continue;
    await p.waitForTimeout(170); steps++;
    const r = await ev(()=>{
      const rows = sweepCached(), a = active(), fk = forkCase();
      const vis = e => !!(e && e.offsetParent);
      return {
        rowsOk: rows.length === (a.length + (a.length>1?1:0)),
        fork: !!fk, two: !document.getElementById('fork2').hidden,
        dup: new Set(shocks.map(s=>s.key)).size !== shocks.length,
        many: shocks.length > MAXSHOCKS,
        selDup: [...document.getElementById('addsel').options].some(o=>shocks.some(s=>s.key===o.value)),
        addOff: document.getElementById('add').disabled, nsh: shocks.length,
        revealOff: document.getElementById('reveal').disabled, act: a.length,
        cells: [...document.querySelectorAll('#fx td.v')].map(t=>t.textContent.trim()),
        revealed,
        lockOk: shocks.filter(s=>s.on && s.form==='set' && !isStock(s.key))
                      .every(s=>base[s.key].fixed === true),
        badText: /NaN|Infinity|undefined/.test(document.body.innerText),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        coords: vis(document.getElementById('coords')) === (picked.length > 0),
        paths: document.getElementById('pathsblock').hidden ||
               document.querySelectorAll('#pathrows .pathgrid').length === (fk ? fk.cases.length : 1),
      };
    });
    const tag = {step, what};
    if (errs.length) walkFail = walkFail || {tag, errs: errs.slice(0,2)};
    if (r.badText) walkFail = walkFail || {tag, why:'NaN в тексте'};
    if (!r.rowsOk) walkFail = walkFail || {tag, why:'строк не столько, сколько шоков'};
    if (r.fork !== r.two) walkFail = walkFail || {tag, why:'вторая диаграмма не совпала с развилкой'};
    if (r.dup || r.many || r.selDup) uiFail = uiFail || {tag, why:'состав шоков разъехался'};
    if (r.nsh >= 3 && !r.addOff) uiFail = uiFail || {tag, why:'«Добавить» не выключилась'};
    if (!r.act && !r.revealOff) uiFail = uiFail || {tag, why:'«Показать ответ» доступна без шоков'};
    if (!r.revealed && r.cells.some(c => c !== '·')) uiFail = uiFail || {tag, why:'ответ виден до кнопки'};
    if (!r.lockOk) uiFail = uiFail || {tag, why:'«новое» не заперло исходное значение'};
    if (r.overflow) uiFail = uiFail || {tag, why:'страница едет вбок'};
    if (!r.coords) uiFail = uiFail || {tag, why:'блок координат не совпал с отметками'};
    if (!r.paths) uiFail = uiFail || {tag, why:'рядов траекторий не столько, сколько случаев'};

    if (step % 30 === 29){
      const hash = await ev(()=>stateToHash());
      const p2 = await ctx.newPage();
      const e2 = []; p2.on('pageerror', e => e2.push(String(e.message)));
      await p2.goto(BASE + hash, {waitUntil:'networkidle'}); await p2.waitForTimeout(450);
      const snap = e => e.evaluate(()=>({
        base: PKEYS.map(k=>k+':'+(+base[k].v.toFixed(6))+':'+(base[k].fixed?1:0)).join(','),
        shocks: shocks.map(s=>[s.key,s.form,+s.value.toFixed(6),s.on?1:0].join(':')).join(';'),
        probIdx, picked: picked.join(',')}));
      const A = await snap(p), B = await snap(p2);
      if (JSON.stringify(A) !== JSON.stringify(B)) linkFail = linkFail || {tag, A, B};
      if (e2.length) linkFail = linkFail || {tag, e2: e2.slice(0,2)};
      await p2.close();
    }
  }
  ok('случайное блуждание не роняет страницу (' + steps + ' шагов)', !walkFail, walkFail);
  ok('и интерфейс держит свои правила', !uiFail, uiFail);
  ok('ссылка восстанавливает состояние целиком', !linkFail, linkFail);

  /* ============ 3. битые ссылки ============ */
  const HASHES = [
    '#v=4&b=s:abc:1,d:-5:9,a:2:1&k=s:set:NaN:1;s:add:1:1;zz:mul:2:1;d:xxx:1:1&p=99&pts=a,b,c',
    '#v=4&b=&k=&p=&pts=',
    '#b=s:0.5:1&k=K:mul:0:1;L:mul:-1:1',
    '#v=9&b=n:1:1,g:1:1&k=n:add:99:1',
    '#k=a:set:0.99:1;a:set:0.5:1;s:set:0.2:1;d:set:0.2:1;n:set:0.2:1',
    '#pts=999,-1,0',
  ];
  let hashFail = null;
  for (const h of HASHES){
    errs.length = 0;
    await p.goto(BASE + h, {waitUntil:'networkidle'}); await p.waitForTimeout(500);
    const r = await ev(()=>({
      base: PKEYS.filter(k=>!isFinite(base[k].v) || base[k].v<META[k].min-1e-9 || base[k].v>META[k].max+1e-9),
      shocks: shocks.filter(s=>!isFinite(s.value) || !META[s.key] || !META[s.key].forms.includes(s.form)),
      dup: new Set(shocks.map(s=>s.key)).size !== shocks.length,
      many: shocks.length > MAXSHOCKS, prob: probIdx >= PROBLEMS.length,
      pts: picked.filter(id => !pointList().some(q=>q.id===id)),
      badText: /NaN|Infinity|undefined/.test(document.body.innerText),
    }));
    const tagh = h.slice(0, 48);
    if (errs.length || r.base.length || r.shocks.length || r.dup || r.many || r.prob ||
        r.pts.length || r.badText)
      hashFail = hashFail || {tagh, r, errs: errs.slice(0,1)};
  }
  ok('битая ссылка не оставляет мусора в состоянии', !hashFail, hashFail);

  await b.close();
  const fails = R.filter(r=>r[0]==='FAIL');
  R.forEach(r=>console.log(r[0].padEnd(5), r[1], r[2] ? '  '+r[2] : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

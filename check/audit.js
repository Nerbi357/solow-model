/* Слепая перепроверка перебора.
 *
 * Скрипт открывает страницу в headless-браузере, но считает ответы САМ:
 * модель ниже выписана заново, из формул, и ничего из index.html не берёт.
 * Дальше он гоняет тысячи конфигураций — исходное состояние, набор свободных
 * параметров, шоки всех трёх форм — и сверяет таблицу инструмента со своей.
 *
 * Плюс инварианты, которые обязаны держаться при любых значениях:
 *   • нет шока по запасу → k краткосрочно не меняется;
 *   • только шоки по запасу → долгосрочных изменений нет;
 *   • всё задано → в таблице не может быть «?»;
 *   • α не тронута и запас не двигался → y краткосрочно не меняется;
 *   • шок «→ новое» обязан запирать исходное значение;
 *   • если перебору негде считать, страница обязана сказать это словами.
 *
 * Запуск:  node check/audit.js        (нужен playwright-core и запущенный
 *          python3 -m http.server 8000 из корня репозитория)
 *
 * Скрипт нарочно медленный: он честно перебирает, а не выбирает удобное.
 */
let chromium;
try { chromium = require('playwright-core').chromium; }
catch (e) {
  try { chromium = require('playwright').chromium; }
  catch (e2) {
    console.error('Нужен playwright: npm i -D playwright-core (или playwright).');
    console.error('Браузер можно указать через CHROME_PATH, адрес страницы — через URL.');
    process.exit(2);
  }
}
const EXE = process.env.CHROME_PATH || undefined;   // по умолчанию — браузер playwright

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(process.env.URL || 'http://localhost:8000/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);

  const res = await p.evaluate(() => {
    /* ============ независимая модель, написанная заново ============ */
    const KEYS = ['s','d','n','g','a'];
    const RNG  = {s:[0.01,0.99], d:[0.01,0.99], n:[0,0.99], g:[0,0.99], a:[0.01,0.99]};
    const VS   = ['y','k','c','i'];
    const okp = q => q.s>0 && q.s<1 && q.a>0 && q.a<1 && q.d>=0 && q.d<1 &&
                     q.n>=0 && q.n<1 && q.g>=0 && q.g<1 && (q.d+q.n+q.g)>0;
    const lnk = q => (Math.log(q.s) - Math.log(q.d+q.n+q.g)) / (1-q.a);
    const bun = (l,q) => ({y:q.a*l, k:l, c:Math.log(1-q.s)+q.a*l, i:Math.log(q.s)+q.a*l});
    const ap  = (q,sh) => {
      if (sh.key==='K'||sh.key==='L') return {...q};
      const r = {...q};
      r[sh.key] = sh.form==='set' ? sh.value
                : sh.form==='add' ? q[sh.key]+sh.value
                : q[sh.key]*sh.value;
      return r;
    };
    const mu = l => { let m=1; l.forEach(s=>{ if(s.key==='K')m*=s.value; if(s.key==='L')m/=s.value; }); return m; };
    const sg = d => Math.abs(d)<1e-11 ? 'same' : (d>0?'up':'down');

    function refRows(bv, free, shs){
      const nr = shs.length + (shs.length>1?1:0);
      if (!nr) return [];
      const acc = Array.from({length:nr}, () => ({sr:VS.map(()=>new Set()), lr:VS.map(()=>new Set())}));
      const one = q => {
        if (!okp(q)) return;
        const l0 = lnk(q), B = bun(l0,q);
        const got = [];
        for (const sh of shs){
          const q1 = ap(q,sh); if (!okp(q1)) return;
          const m = (sh.key==='K'||sh.key==='L') ? mu([sh]) : 1;
          const S = bun(l0+Math.log(m), q1), L = bun(lnk(q1), q1);
          got.push({sr:VS.map(v=>sg(S[v]-B[v])), lr:VS.map(v=>sg(L[v]-B[v]))});
        }
        if (shs.length>1){
          let q1 = {...q};
          for (const sh of shs){ q1 = ap(q1,sh); if (!okp(q1)) return; }
          const S = bun(l0+Math.log(mu(shs)), q1), L = bun(lnk(q1), q1);
          got.push({sr:VS.map(v=>sg(S[v]-B[v])), lr:VS.map(v=>sg(L[v]-B[v]))});
        }
        got.forEach((g,i)=>VS.forEach((_,j)=>{ acc[i].sr[j].add(g.sr[j]); acc[i].lr[j].add(g.lr[j]); }));
      };
      const N = free.length===0 ? 1 : free.length===1 ? 4001 : free.length===2 ? 201 : 61;
      const total = Math.pow(N, free.length);
      for (let idx=0; idx<total; idx++){
        const q = {...bv}; let r = idx;
        for (const k of free){ const j = r%N; r = (r-j)/N; q[k] = RNG[k][0] + (RNG[k][1]-RNG[k][0])*j/(N-1); }
        one(q);
      }
      const pick = st => st.size===1 ? [...st][0] : 'dunno';
      return acc.map(a=>({sr:a.sr.map(pick), lr:a.lr.map(pick)}));
    }
    const flat = r => r.map(x=>x.sr.join(',')+'|'+x.lr.join(',')).join(' // ');

    /* ================= перебор конфигураций ================= */
    const BASES = [
      {s:.20,d:.10,n:0,  g:0,  a:1/3},
      {s:.10,d:.10,n:0,  g:0,  a:.30},
      {s:.50,d:.05,n:.02,g:.01,a:.60},
      {s:.04,d:.40,n:0,  g:0,  a:.15},
      {s:.90,d:.02,n:0,  g:0,  a:.88}
    ];
    const FREE = [[], ['a'], ['d'], ['s'], ['n'], ['g'], ['a','d'], ['s','a'], ['d','n']];
    const SH = [];
    ['s','d','n','g','a'].forEach(k=>{
      SH.push({key:k,form:'set',value:null,rel:0.6});
      SH.push({key:k,form:'set',value:null,rel:1.4});
      SH.push({key:k,form:'add',value:0.05});
      SH.push({key:k,form:'add',value:-0.03});
      SH.push({key:k,form:'add',value:0.5});
      SH.push({key:k,form:'add',value:-0.5});
      SH.push({key:k,form:'mul',value:0.75});
      SH.push({key:k,form:'mul',value:1.3});
      SH.push({key:k,form:'mul',value:3});
      SH.push({key:k,form:'mul',value:0.05});
    });
    ['K','L'].forEach(k=>{ SH.push({key:k,form:'mul',value:0.8}); SH.push({key:k,form:'mul',value:1.25}); });

    const bad = [], seen = {mismatch:0, inv:0, mute:0, lock:0, checks:0, cfgs:0, clamped:0, cut:0};
    const note = (kind, msg, cfg) => { seen[kind]++; if (bad.length<40) bad.push(kind.toUpperCase()+': '+msg+'  ['+cfg+']'); };

    const run = (bv, free, shs, tag) => {
      seen.cfgs++;
      base = {}; KEYS.forEach(k => base[k] = {v: bv[k], fixed: free.indexOf(k)<0});
      shocks = shs.map((s,i)=>({key:s.key, form:s.form, value:s.value, on:true, ci:i}));
      const wanted = shocks.map(s=>s.value);

      /* именно то, что делает страница при любой структурной правке */
      enforceLocks();
      if (shocks.some((s,i)=>Math.abs(s.value-wanted[i])>1e-12)) seen.clamped++;

      /* Шок «→ новое» обязан запирать исходное значение */
      shocks.forEach(s=>{ if (s.form==='set' && base[s.key] && !base[s.key].fixed)
        note('lock','шок «'+s.key+' → новое», а исходное осталось свободным', tag); });

      sweepCache = {key:null, val:null, stat:null};
      let rows;
      try { rows = sweepCached(); } catch(e){ note('inv','sweep упал: '+e.message, tag); return; }
      const act = active();
      const nr = act.length + (act.length>1?1:0);
      const nowFree = KEYS.filter(k=>!base[k].fixed);

      /* --- инварианты --- */
      seen.checks++;
      if (rows.length !== nr) note('inv','строк '+rows.length+', ожидалось '+nr, tag);
      if (!act.length) return;

      const stock = act.filter(s=>s.key==='K'||s.key==='L');
      const param = act.filter(s=>s.key!=='K'&&s.key!=='L');
      const last = rows[rows.length-1];
      const anyQ = rows.some(r=>r.sr.concat(r.lr).some(x=>x==='dunno'));
      const cuts = rangeCuts();
      if (cuts.length) seen.cut++;

      if (!stock.length && last.sr[1] !== 'same')
        note('inv','нет шока по запасу, но k краткосрочно не «=»: '+last.sr[1], tag);
      if (!param.length && !last.lr.every(x=>x==='same'))
        note('inv','только шоки по запасу, но в длинной строке не «=»: '+last.lr.join(','), tag);
      if (!nowFree.length && anyQ)
        note('inv','всё задано, но в таблице есть «?»', tag);
      const touchesA = param.some(s=>s.key==='a');
      if (!touchesA && !stock.length && last.sr[0] !== 'same')
        note('inv','α не тронута и запас не двигался, но y краткосрочно не «=»: '+last.sr[0], tag);
      rows.forEach(r=>r.sr.concat(r.lr).forEach(x=>{
        if (['up','down','same','dunno'].indexOf(x)<0) note('inv','недопустимое значение клетки: '+x, tag);
      }));

      /* --- шок за границами обязан быть назван вслух --- */
      seen.checks++;
      if (SWEEPSTAT.seen === 0){
        if (!cuts.some(c=>c.none))
          note('mute','перебору негде считать, но rangeCuts() молчит', tag);
        if (!nowFree.length && !cuts.length)
          note('mute','всё задано, считать нечего, и объяснения нет', tag);
      }
      /* сужение диапазона тоже обязано быть названо */
      if (nowFree.length){
        let ok2 = 0, tot = 0;
        const N2 = 41, T2 = Math.pow(N2, nowFree.length);
        for (let idx=0; idx<T2 && tot<6000; idx++){
          const q = {}; KEYS.forEach(k=>q[k]=base[k].v);
          let r = idx;
          for (const k of nowFree){ const j=r%N2; r=(r-j)/N2; q[k]=RNG[k][0]+(RNG[k][1]-RNG[k][0])*j/(N2-1); }
          tot++; if (rowsAt(q)) ok2++;
        }
        if (ok2 < tot && !cuts.length)
          note('mute','перебор сужен ('+ok2+'/'+tot+'), но об этом не сказано', tag);
        /* порог «мелкий край области определения» не должен прятать заметное сужение */
        if (ok2 / tot < 0.9 && !cuts.some(c=>c.big))
          note('mute','отрезано '+(tot-ok2)+'/'+tot+', а заметным это не считается', tag);
      }

      /* --- сверка с независимым расчётом --- */
      if (nowFree.length <= 2){
        const bv2 = {}; KEYS.forEach(k=>bv2[k]=base[k].v);
        const ref = refRows(bv2, nowFree, shocks.filter(s=>s.on));
        seen.checks++;
        if (flat(ref) !== flat(rows))
          note('mismatch','инструмент '+flat(rows)+'  против  эталона '+flat(ref), tag);
      }
    };

    BASES.forEach((bv,bi)=>FREE.forEach(free=>SH.forEach(sd=>{
      const sh = {...sd};
      if (sh.value === null){
        const lo = RNG[sh.key][0], hi = RNG[sh.key][1];
        sh.value = Math.min(hi, Math.max(lo, bv[sh.key]*sd.rel));
      }
      run(bv, free, [sh], 'b'+bi+' f['+free+'] '+sh.key+':'+sh.form+'='+(+sh.value.toFixed(3)));
    })));

    const PAIRS = [
      [{key:'s',form:'set',value:.30},{key:'d',form:'set',value:.12}],
      [{key:'K',form:'mul',value:.8},{key:'L',form:'mul',value:1.25}],
      [{key:'L',form:'mul',value:.9},{key:'d',form:'add',value:.05}],
      [{key:'s',form:'set',value:.22},{key:'a',form:'set',value:.35}],
      [{key:'a',form:'mul',value:1.2},{key:'n',form:'add',value:.02}],
      [{key:'g',form:'set',value:.03},{key:'K',form:'mul',value:1.5}],
      [{key:'n',form:'add',value:.5},{key:'g',form:'add',value:.5}],
      [{key:'a',form:'mul',value:3},{key:'s',form:'mul',value:.05}]
    ];
    BASES.forEach((bv,bi)=>FREE.forEach(free=>PAIRS.forEach((pr,pi)=>
      run(bv, free, pr.map(x=>({...x})), 'b'+bi+' f['+free+'] пара'+pi))));

    /* тройки — предел инструмента */
    const TRIPLES = [
      [{key:'s',form:'set',value:.30},{key:'d',form:'add',value:.05},{key:'K',form:'mul',value:.8}],
      [{key:'a',form:'set',value:.5},{key:'n',form:'add',value:.02},{key:'L',form:'mul',value:1.2}],
      [{key:'s',form:'mul',value:1.5},{key:'g',form:'add',value:.01},{key:'d',form:'mul',value:.8}]
    ];
    BASES.forEach((bv,bi)=>FREE.forEach(free=>TRIPLES.forEach((tr,ti)=>
      run(bv, free, tr.map(x=>({...x})), 'b'+bi+' f['+free+'] тройка'+ti))));

    return {bad, seen};
  });

  console.log('конфигураций:', res.seen.cfgs, ' проверок:', res.seen.checks);
  console.log('расхождений с эталоном:', res.seen.mismatch);
  console.log('нарушений инвариантов:', res.seen.inv);
  console.log('незапертых «→ новое»:', res.seen.lock);
  console.log('молчаливых сужений:', res.seen.mute);
  console.log('---');
  console.log('шоков подрезано границами:', res.seen.clamped, ' конфигураций с сужением:', res.seen.cut);
  console.log('');
  res.bad.forEach(x => console.log('  ' + x));
  if (errs.length) console.log('\nошибки страницы:', errs);
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });

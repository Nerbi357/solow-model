/* Слепая перепроверка перебора.
 *
 * Скрипт открывает страницу в headless-браузере, но считает ответы САМ:
 * модель ниже выписана заново, из формул, и ничего из index.html не берёт.
 * Дальше он гоняет тысячи конфигураций — исходное состояние, набор свободных
 * параметров, шоки всех трёх форм — и сверяет таблицу инструмента со своей.
 *
 * На развилке сверяется и каждый случай: своя модель делит точки по сторонам
 * от k = 1 и отвечает за каждую сторону отдельно, с плотной лестницей точек
 * у самой границы, где полосы смены знака тоньше любого шага сетки. Случаев
 * обязано быть два ровно тогда, когда допустимые точки есть по обе стороны,
 * и картинка случая обязана стоять на своей стороне.
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
 *          ONLY_NAMED=1 node check/audit.js — только именованные случаи,
 *          за секунды: удобно, чтобы убедиться, что аудит ловит поломку.
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

  const res = await p.evaluate(onlyNamed => {
    /* ============ независимая модель, написанная заново ============ */
    const KEYS = ['s','d','n','g','a'];
    /* Область перебора — вход, а не ожидание: слепота проверки в том, что модель
       ниже выписана заново, а не в том, что границы угаданы. Границы — решение 8
       (review/DECISIONS.md), и одни и те же у исходного значения, у значения
       после шока и у перебора: точка, где хоть одно из них вне RNG, не считается. */
    const RNG  = {s:[0.000001,0.999999], d:[0.000001,0.999999], n:[0,0.999999], g:[0,0.999999], a:[0.000001,0.999]};
    const VS   = ['y','k','c','i'];
    const okp = q => KEYS.every(k => q[k] >= RNG[k][0]-1e-12 && q[k] <= RNG[k][1]+1e-12) &&
                     (q.d+q.n+q.g)>0;
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

    /* Сторона от k = 1 — соглашение инструмента, а не свойство модели: ровно
       на границе шок по α не меняет ничего, и такая точка не принадлежит
       ни одному случаю. Ширина полосы по ln s − ln(δ+n+g) — вход, как и RNG. */
    const SIDE = 1e-6;
    const sideAt = q => { const r = Math.log(q.s) - Math.log(q.d+q.n+q.g);
                          return Math.abs(r) < SIDE ? null : r > 0; };
    /* Сверхмелкий провал знака — предел сетки, а не ошибка (решение 23
       в review/DECISIONS.md): знак, который находится только с величиной
       изменения меньше MICRO в логарифмах, в расхождение не идёт, а
       считается отдельной строкой. На сетке страницы провалы в 3·10⁻⁵
       ловятся, в 10⁻⁵ — уже нет. */
    const MICRO = 3e-5;

    /* Строки при одном наборе параметров: каждый шок отдельно и, если шоков
       больше одного, все вместе. Пишутся разности логарифмов, а не знаки, —
       чтобы было видно, насколько мелок найденный знак: по восемь чисел
       на строку (кратко y k c i, долго y k c i) в плоский массив, потому что
       точек сотни тысяч. false — точка вне модели. */
    function rowsInto(q, shs, out){
      if (!okp(q)) return false;
      const l0 = lnk(q), B = bun(l0,q);
      let r = 0;
      const put = (q1, m) => {
        const S = bun(l0+Math.log(m), q1), L = bun(lnk(q1), q1), o = r*8;
        out[o]   = S.y-B.y; out[o+1] = S.k-B.k; out[o+2] = S.c-B.c; out[o+3] = S.i-B.i;
        out[o+4] = L.y-B.y; out[o+5] = L.k-B.k; out[o+6] = L.c-B.c; out[o+7] = L.i-B.i;
        r++;
      };
      for (const sh of shs){
        const q1 = ap(q,sh); if (!okp(q1)) return false;
        put(q1, (sh.key==='K'||sh.key==='L') ? mu([sh]) : 1);
      }
      if (shs.length>1){
        let q1 = {...q};
        for (const sh of shs){ q1 = ap(q1,sh); if (!okp(q1)) return false; }
        put(q1, mu(shs));
      }
      return true;
    }

    /* Корзины: вся область (0) и две стороны от k = 1 — «k < 1» (1)
       и «k > 1» (2). В каждой для каждой клетки и каждого знака (вырос, упал,
       не изменился) — самое большое изменение с этим знаком и точка, где
       оно найдено. mag = −1 — такого знака не было. */
    const SG = ['up','down','same'];
    const sgi = d => Math.abs(d)<1e-11 ? 2 : (d>0 ? 0 : 1);
    function refAcc(bv, free, shs){
      const nr = shs.length + (shs.length>1?1:0), nc = nr*8;
      const mag = [0,1,2].map(()=>new Float64Array(nc*3).fill(-1));
      const wit = [0,1,2].map(()=>new Float64Array(nc*3*5));
      const cnt = [0,0,0];
      const A = {nr, mag, wit, cnt};
      if (!nr) return A;
      const out = new Float64Array(nc);
      const add = (b, q) => {
        const M = mag[b], W = wit[b];
        for (let c=0; c<nc; c++){
          const d = out[c], x = c*3 + sgi(d), m = Math.abs(d);
          if (m > M[x]){ M[x] = m; const o = x*5; W[o]=q.s; W[o+1]=q.d; W[o+2]=q.n; W[o+3]=q.g; W[o+4]=q.a; }
        }
        cnt[b]++;
      };
      const one = q => {
        if (!rowsInto(q, shs, out)) return;
        add(0, q);
        const sd = sideAt(q);
        if (sd === true) add(2, q); else if (sd === false) add(1, q);
      };
      /* 1. равномерная сетка по всем свободным сразу */
      const N = free.length===0 ? 1 : free.length===1 ? 4001 : free.length===2 ? 201 : 61;
      const total = Math.pow(N, free.length);
      const q = {...bv};
      for (let idx=0; idx<total; idx++){
        let r = idx;
        for (const k of free){ const j = r%N; r = (r-j)/N; q[k] = RNG[k][0] + (RNG[k][1]-RNG[k][0])*j/(N-1); }
        one(q);
      }
      /* 2. Тонкие линии вдоль каждой оси через края и середину остальных:
         полоса по одному параметру бывает уже шага сетки — при шоке «s − 0,5»
         потребление падает только при s от 0,5005 до ~0,51. При двух свободных
         шаг сетки и так мал, а редкий промах закроет прицельный поиск. */
      if (free.length >= 3){
        const F = [0, 0.02, 0.5, 0.98, 1];
        free.forEach(v => {
          const others = free.filter(o=>o!==v);
          const tot = Math.pow(F.length, others.length);
          for (let idx=0; idx<tot; idx++){
            let r = idx;
            for (const o of others){ const j = r%F.length; r = (r-j)/F.length; q[o] = RNG[o][0] + (RNG[o][1]-RNG[o][0])*F[j]; }
            for (let j=0; j<=2000; j++){ q[v] = RNG[v][0] + (RNG[v][1]-RNG[v][0])*j/2000; one(q); }
          }
        });
      }
      /* 3. У границы k = 1 шок по α почти ничего не меняет, и знак там задают
         остальные шоки; по параметрам эта полоса тоньше любого шага сетки.
         Поэтому каждая свободная из s, δ, n, g решается так, чтобы
         ln s − ln(δ+n+g) встал на плотную геометрическую лестницу от 1,2·10⁻⁶
         до 0,8 с обеих сторон, а остальные свободные идут своей сеткой. */
      const sideKeys = free.filter(k=>k!=='a');
      if (shs.some(s=>s.key==='a') && sideKeys.length){
        const T = []; for (let t=1.2e-6; t<0.8; t*=1.25) T.push(t);
        sideKeys.forEach(v => {
          const others = free.filter(o=>o!==v);
          const G = others.length===1 ? 101 : others.length===2 ? 31 : 13;
          const tot = Math.pow(G, others.length);
          const q0 = {...bv};
          for (let idx=0; idx<tot; idx++){
            let r = idx;
            for (const o of others){ const j = r%G; r = (r-j)/G; q0[o] = RNG[o][0] + (RNG[o][1]-RNG[o][0])*j/(G-1); }
            const rest = q0.d+q0.n+q0.g - (v==='s' ? 0 : q0[v]);
            const s0 = q0.s, v0 = q0[v];
            for (const sgn of [1,-1]) for (const t of T){
              const x = v==='s' ? rest*Math.exp(sgn*t) : s0*Math.exp(-sgn*t) - rest;
              if (x < RNG[v][0] || x > RNG[v][1]) continue;
              q0[v] = x; one(q0);
            }
            q0[v] = v0;
          }
        });
      }
      return A;
    }
    /* Прицельный поиск чужого знака в одной клетке. Нужен, когда страница
       ответила «?», а своих знаков один: полосу мог пропустить и эталон.
       Сначала 300 тысяч случайных точек, потом плотные линии вдоль каждой оси
       через узлы остальных с шагом в десятую диапазона. bk — корзина:
       0 вся область, 1 сторона k < 1, 2 сторона k > 1. */
    function hunt(bv, free, shs, bk, c, avoid){
      const nr = shs.length + (shs.length>1?1:0), out = new Float64Array(nr*8);
      let seed = 20260927;
      const rnd = () => { seed = (seed*1103515245 + 12345) % 2147483648; return seed/2147483648; };
      const test = q => {
        if (!rowsInto(q, shs, out)) return false;
        if (bk){ const sd = sideAt(q); if (sd === null || sd !== (bk===2)) return false; }
        return SG[sgi(out[c])] !== avoid;
      };
      const q = {...bv};
      for (let t=0; t<300000; t++){
        for (const k of free) q[k] = RNG[k][0] + (RNG[k][1]-RNG[k][0])*rnd();
        if (test(q)) return {...q};
      }
      for (const v of free){
        const others = free.filter(o=>o!==v), tot = Math.pow(11, others.length);
        for (let idx=0; idx<tot; idx++){
          let r = idx;
          for (const o of others){ const j = r%11; r = (r-j)/11; q[o] = RNG[o][0] + (RNG[o][1]-RNG[o][0])*j/10; }
          for (let j=0; j<=4000; j++){ q[v] = RNG[v][0] + (RNG[v][1]-RNG[v][0])*j/4000; if (test(q)) return {...q}; }
        }
      }
      return null;
    }
    /* Ответ корзины по клетке — как у страницы: один знак — он, иначе «?» */
    const cellOf = (A, b, c) => {
      const out = {};
      for (let s=0; s<3; s++){ const x = c*3+s; if (A.mag[b][x] >= 0){ const o = x*5, W = A.wit[b];
        out[SG[s]] = {mag:A.mag[b][x], at:{s:W[o], d:W[o+1], n:W[o+2], g:W[o+3], a:W[o+4]}}; } }
      return out;
    };
    /* Клетка страницы против своей корзины. «too-sure» — страница дала стрелку,
       а знак другой найден с заметной величиной; «less-sure» — страница
       ответила «?», а своих знаков один; «micro» — другой знак есть, но только
       сверхмелкий. */
    const judge = (page, c) => {
      const signs = Object.keys(c);
      if (!signs.length) return page==='dunno' ? 'ok' : 'empty';
      if (page==='dunno') return signs.length>1 ? 'ok' : 'less-sure';
      const other = signs.filter(s=>s!==page);
      if (!c[page]) return 'too-sure';
      if (!other.length) return 'ok';
      return other.every(s=>c[s].mag < MICRO) ? 'micro' : 'too-sure';
    };
    const CELLN = (i, per, j) => 'стр.'+(i+1)+' '+(per==='sr'?'кратко':'долго')+' '+VS[j];
    const fmtQ = q => KEYS.map(k=>k+'='+(+q[k].toPrecision(6))).join(' ');

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

    const bad = [], seen = {mismatch:0, inv:0, mute:0, lock:0, case:0, checks:0, cfgs:0,
                            clamped:0, cut:0, forks:0, micro:0, hunted:0};
    const note = (kind, msg, cfg) => { seen[kind]++; if (bad.length<40) bad.push(kind.toUpperCase()+': '+msg+'  ['+cfg+']'); };

    const run = (bv, free, shs, tag) => {
      seen.cfgs++;
      base = {}; KEYS.forEach(k => base[k] = {v: bv[k], fixed: free.indexOf(k)<0, def: bv[k]});
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
        /* Сетка целиком, около двух тысяч узлов, а не первые 6000 узлов
           большой: обрезанный обход — это угол области (первые узлы последней
           оси), и при трёх свободных он видел 28% отрезанного там, где
           отрезан 1%. */
        const N2 = Math.max(3, Math.round(Math.pow(2000, 1/nowFree.length))),
              T2 = Math.pow(N2, nowFree.length);
        for (let idx=0; idx<T2; idx++){
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

      /* --- сверка с независимым расчётом: вся таблица и каждый случай --- */
      if (nowFree.length <= 3){
        const bv2 = {}; KEYS.forEach(k=>bv2[k]=base[k].v);
        const A = refAcc(bv2, nowFree, shocks.filter(s=>s.on));
        seen.checks++;
        const ctx = {bv:bv2, free:nowFree, shs:shocks.filter(s=>s.on)};
        cmpRows('таблица', rows, A, 0, tag, 'mismatch', ctx);

        /* Развилка есть ровно тогда, когда шок по α есть и допустимые точки
           лежат по обе стороны от k = 1. Каждый случай сверяется со своей
           корзиной, а картинка случая обязана стоять на своей стороне. */
        const fk = forkCase();
        const both = act.some(s=>s.key==='a') && A.cnt[1]>0 && A.cnt[2]>0;
        seen.checks++;
        if (!!fk !== both)
          note('case', (fk ? 'страница рисует два случая' : 'случай один') +
               ', а своих точек: k < 1 — '+A.cnt[1]+', k > 1 — '+A.cnt[2], tag);
        if (fk){
          seen.forks++;
          fk.cases.forEach(c=>{
            const side = c.lim.side, nm = side ? 'k > 1' : 'k < 1';
            seen.checks++;
            if (sideAt(c.vals) !== side)
              note('case','картинка случая «'+nm+'» стоит не на своей стороне: '+fmtQ(c.vals), tag);
            const cr = caseSweep(c.lim);
            cmpRows('случай «'+nm+'»', cr, A, side ? 2 : 1, tag, 'case', ctx);
            /* при единственном шоке по α сторона решает знак каждой клетки */
            if (act.length===1 && act[0].key==='a' && cr.some(r=>r.sr.concat(r.lr).includes('dunno')))
              note('case','единственный шок по α, а в случае «'+nm+'» есть «?»', tag);
          });
        }
      }
    };
    /* Клетка за клеткой. Сверхмелкий провал считается отдельно и в провал
       прогона не идёт; всё остальное — с точкой, где найден чужой знак. */
    function cmpRows(what, prow, A, bk, tag, kind, ctx){
      if (prow.length !== A.nr){
        note(kind, what+': строк '+prow.length+', своих '+A.nr, tag); return; }
      prow.forEach((r,i)=>['sr','lr'].forEach((per,pi)=>r[per].forEach((v,j)=>{
        const ci = i*8 + pi*4 + j, c = cellOf(A, bk, ci);
        let jd = judge(v, c), extra = '';
        if (jd==='ok') return;
        if (jd==='micro'){ seen.micro++; return; }
        if (jd==='less-sure'){
          const w = hunt(ctx.bv, ctx.free, ctx.shs, bk, ci, Object.keys(c)[0]);
          if (w){ seen.hunted++; return; }
        }
        if (jd==='too-sure'){
          /* своя точка с чужим знаком — что в ней считает сама страница? */
          const other = Object.keys(c).filter(s=>s!==v).sort((a,b)=>c[b].mag-c[a].mag)[0];
          const pr = other && rowsAt(c[other].at);
          const pv = pr && pr[i] ? pr[i][per][j] : 'вне модели';
          extra = pv===other ? ' — страница в этой точке сама считает '+pv+': перебор её пропустил'
                             : ' — страница в этой точке считает '+pv+': расходится модель';
        }
        const w = Object.keys(c).map(s=>s+' ('+c[s].mag.toExponential(1)+') при '+fmtQ(c[s].at)).join('; ');
        note(kind, what+', '+CELLN(i,per,j)+': страница '+v+', своих — '+(w||'нет точек')+' ['+jd+']'+extra, tag);
      })));
    }

    if (!onlyNamed) BASES.forEach((bv,bi)=>FREE.forEach(free=>SH.forEach(sd=>{
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
    if (!onlyNamed) BASES.forEach((bv,bi)=>FREE.forEach(free=>PAIRS.forEach((pr,pi)=>
      run(bv, free, pr.map(x=>({...x})), 'b'+bi+' f['+free+'] пара'+pi))));

    /* тройки — предел инструмента */
    const TRIPLES = [
      [{key:'s',form:'set',value:.30},{key:'d',form:'add',value:.05},{key:'K',form:'mul',value:.8}],
      [{key:'a',form:'set',value:.5},{key:'n',form:'add',value:.02},{key:'L',form:'mul',value:1.2}],
      [{key:'s',form:'mul',value:1.5},{key:'g',form:'add',value:.01},{key:'d',form:'mul',value:.8}]
    ];
    if (!onlyNamed) BASES.forEach((bv,bi)=>FREE.forEach(free=>TRIPLES.forEach((tr,ti)=>
      run(bv, free, tr.map(x=>({...x})), 'b'+bi+' f['+free+'] тройка'+ti))));

    /* Три свободных параметра — там ветка «k > 1» бывает углом области,
       мимо которого проходят фиксированные точки перебора. Только наборы
       с шоком по α: без него случаев нет. */
    const FREE3 = [['d','n','g'], ['s','d','a']];
    const WITH_A = PAIRS.filter(pr=>pr.some(x=>x.key==='a')).concat(TRIPLES.filter(tr=>tr.some(x=>x.key==='a')));
    if (!onlyNamed) BASES.forEach((bv,bi)=>FREE3.forEach(free=>WITH_A.forEach((sh,si)=>
      run(bv, free, sh.map(x=>({...x})), 'b'+bi+' f['+free+'] с α №'+si))));

    /* Именованные случаи: узкие полосы у k = 1, края диапазонов, склейки.
       Первые два — находка W3-01 агентной проверки, остальные — из списка
       агента A1 (review/REPORT.md). Формат: база, свободные, шоки. */
    const S_ = (key, form, value) => ({key, form, value});
    const NAMED = [
      ['W3-01 α=0,9', {s:.1,d:.098,n:0,g:0,a:.9}, ['n','g'], [S_('a','set',.35), S_('g','add',.02)]],
      ['W3-01 угол', {s:.148,d:.129,n:0,g:0,a:.678}, ['s','n','a'], [S_('a','set',.173), S_('s','add',.01)]],
      ['у края δ', {s:.2,d:.01,n:0,g:0,a:.3}, ['s'], [S_('a','set',.6), S_('d','add',.001)]],
      ['δ − 0,5', {s:.5,d:.8,n:0,g:0,a:.3}, ['d'], [S_('d','add',-.5), S_('a','set',.6)]],
      ['δ − 0,5, s = 0,52', {s:.52,d:.8,n:0,g:0,a:.3}, ['d'], [S_('d','add',-.5), S_('a','set',.6)]],
      ['n − 0,3', {s:.35,d:.01,n:.5,g:0,a:.3}, ['n'], [S_('n','add',-.3), S_('a','add',.2)]],
      ['n × 2 у k = 1', {s:.011,d:.01,n:0,g:0,a:.4}, ['n'], [S_('a','set',.7), S_('n','mul',2)]],
      ['δ = 0,97', {s:.5,d:.97,n:.01,g:0,a:.3}, ['s'], [S_('a','set',.6)]],
      ['δ = 0,985', {s:.5,d:.985,n:0,g:0,a:.3}, ['s'], [S_('a','set',.6), S_('s','add',-.001)]],
      ['K и L поровну', {s:.2,d:.1,n:0,g:0,a:.3}, ['s'], [S_('K','mul',1.5), S_('L','mul',1.5), S_('a','set',.6)]],
      ['K × 2, L × 0,5', {s:.2,d:.1,n:0,g:0,a:.3}, ['s'], [S_('K','mul',2), S_('L','mul',.5), S_('a','set',.1)]],
      ['α − 0,97', {s:.3,d:.05,n:0,g:0,a:.5}, ['s','d','a'], [S_('a','add',-.97), S_('K','mul',.5)]],
      ['α × 0,011', {s:.3,d:.05,n:0,g:0,a:.5}, ['s','a'], [S_('a','mul',.011), S_('s','add',.5)]],
      ['α → 0,99', {s:.3,d:.05,n:0,g:0,a:.3}, ['s','d'], [S_('a','set',.99)]],
      ['α × 3,3', {s:.2,d:.1,n:0,g:0,a:.3}, ['s'], [S_('a','mul',3.3), S_('K','mul',.5)]],
      ['α + 0,5', {s:.2,d:.1,n:0,g:0,a:.3}, ['s','d','a'], [S_('a','add',.5)]],
      ['α × 0,5, s + 0,1', {s:.2,d:.1,n:0,g:0,a:.5}, ['s','a'], [S_('a','mul',.5), S_('s','add',.1), S_('K','mul',2)]],
      ['s + 0,98', {s:.2,d:.01,n:0,g:0,a:.3}, ['s'], [S_('s','add',.98), S_('a','set',.6)]],
      ['s × 90', {s:.2,d:.01,n:0,g:0,a:.3}, ['s'], [S_('s','mul',90), S_('a','add',.2)]],
      ['s × 1,98, α × 2', {s:.2,d:.01,n:0,g:0,a:.3}, ['s'], [S_('s','mul',1.98), S_('a','mul',2)]],
      /* Эти три видит только проход через узлы грубой сетки внутри ветки:
         ни лестница у k = 1, ни тонкие линии по осям в их полосу не попадают.
         Найдены разностным перебором: без этого прохода страница отвечала
         уверенной стрелкой там, где ответ ветки — «?». */
      ['узел ветки 1', {s:.1,d:.01,n:.9,g:.01,a:.9}, ['s','g','a'], [S_('a','mul',1.5), S_('s','add',-.01)]],
      ['узел ветки 2', {s:.2,d:.2,n:.05,g:.9,a:.97}, ['s','d','n'], [S_('a','add',.02), S_('n','add',-.01)]],
      ['узел ветки 3', {s:.3,d:.9,n:.05,g:.01,a:.7}, ['s','n','g'], [S_('a','set',.1), S_('g','add',-.05)]]
    ];
    NAMED.forEach(([nm, bv, free, shs]) => run(bv, free, shs, nm));

    return {bad, seen};
  }, !!process.env.ONLY_NAMED);

  console.log('конфигураций:', res.seen.cfgs, ' проверок:', res.seen.checks,
              ' из них с двумя случаями:', res.seen.forks);
  console.log('расхождений с эталоном:', res.seen.mismatch);
  console.log('расхождений по случаям:', res.seen.case);
  console.log('нарушений инвариантов:', res.seen.inv);
  console.log('незапертых «→ новое»:', res.seen.lock);
  console.log('молчаливых сужений:', res.seen.mute);
  console.log('---');
  console.log('шоков подрезано границами:', res.seen.clamped, ' конфигураций с сужением:', res.seen.cut);
  console.log('сверхмелких провалов знака (предел сетки, не ошибка):', res.seen.micro);
  console.log('«?» страницы, подтверждённых прицельным поиском:', res.seen.hunted);
  console.log('');
  res.bad.forEach(x => console.log('  ' + x));
  if (errs.length) console.log('\nошибки страницы:', errs);
  await b.close();
  /* all.sh судит по коду выхода: без него расхождения печатались, а прогон
     оставался зелёным. */
  const fails = res.seen.mismatch + res.seen.case + res.seen.inv + res.seen.lock +
                res.seen.mute + errs.length;
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

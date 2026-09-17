/* Подписи состояний на оси: скачок, new, склейка запятой
 *
 * Запуск: node check/ui-marks.js   (нужен playwright и python3 -m http.server 8000)
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
  const p = await (await b.newContext({viewport:{width:1600,height:1250}, deviceScaleFactor:2})).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const ev = (fn, a) => p.evaluate(fn, a);
  const marks = () => ev(() => statesOf().filter(s => s.axis).map(s => s.mark));
  const legend = () => ev(() => legendItems(statesOf()).map(i => i.t));
  const load = async i => { await ev(i => document.querySelector('[data-p="'+i+'"]').click(), i); await p.waitForTimeout(600); };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  PROBN = await p.evaluate(()=>PROBLEMS.length);

  /* ---- 1.i: стационар не двигается, значит new быть не должно ---- */
  await load(0);
  const m0 = await marks();
  ok('1.i — стационар на месте, «new» не появляется', m0.indexOf('new') < 0, m0);
  ok('1.i — точка сразу после шоков зовётся «скачок»', m0.indexOf('скачок') >= 0, m0);
  ok('1.i — ровно четыре подписи: old, k₁, k₂, скачок',
     JSON.stringify(m0) === JSON.stringify(['old','k₁','k₂','скачок']), m0);
  ok('1.i — совпавшие k₁ и k₂ склеены запятой',
     await ev(()=>{ const t=[]; statesOf(); return true; }) &&
     (await ev(()=>{
        /* достаём то, что реально пишется на оси */
        const sts = statesOf().filter(s=>s.axis), out = [];
        sts.forEach(st=>{ const h = out.find(o=>Math.abs(o.k/st.k-1)<1e-9);
          if (h) h.t += ', ' + st.mark; else out.push({k:st.k, t:st.mark}); });
        return out.map(o=>o.t);
     })).indexOf('k₁, k₂') >= 0,
     await ev(()=>{ const sts=statesOf().filter(s=>s.axis), out=[];
       sts.forEach(st=>{ const h=out.find(o=>Math.abs(o.k/st.k-1)<1e-9);
         if (h) h.t += ', '+st.mark; else out.push({k:st.k,t:st.mark}); });
       return out.map(o=>o.t); }));
  ok('1.i — в легенде объяснён скачок',
     (await legend()).some(s => s.indexOf('скачок') >= 0), await legend());
  ok('1.i — «нового равновесия» в легенде нет: его и нет',
     !(await legend()).some(s => s === 'новое равновесие'), await legend());

  /* ---- 1.ii: запас не скачет, значит «скачка» быть не должно ---- */
  await load(1);
  const m1 = await marks();
  ok('1.ii — запас на месте, «скачок» не появляется', m1.indexOf('скачок') < 0, m1);
  ok('1.ii — ровно четыре подписи: old, k₁, k₂, new',
     JSON.stringify(m1) === JSON.stringify(['old','k₁','k₂','new']), m1);
  ok('1.ii — в легенде «новое равновесие»',
     (await legend()).some(s => s === 'новое равновесие'), await legend());

  /* ---- 2.i: живы обе точки, и «new» по-прежнему одна ---- */
  await load(2);
  const m2 = await marks();
  ok('2.i — есть и скачок, и новое равновесие',
     m2.indexOf('скачок') >= 0 && m2.indexOf('new') >= 0, m2);
  ok('2.i — «new» ровно одна', m2.filter(x => x.indexOf('new') === 0).length === 1, m2);
  ok('2.i — пять подписей: old, k₁, k₂, скачок, new',
     JSON.stringify(m2.slice().sort()) === JSON.stringify(['k₁','k₂','new','old','скачок'].sort()), m2);

  /* ---- никаких звёздочек и форм у new, нигде ---- */
  const dirty = [];
  for (let i = 0; i < PROBN; i++){
    await load(i);
    const m = await marks();
    if (m.some(x => /new.+/.test(x))) dirty.push([i, m]);
    if (m.filter(x => x.indexOf('new') === 0).length > 1) dirty.push([i, m]);
  }
  ok('ни в одной задаче нет «new*» или второго new', dirty.length === 0, dirty);

  /* ---- три шока: подписи не размножаются ---- */
  await p.goto(BASE + '#', {waitUntil:'networkidle'});
  await ev(()=>{location.hash='';}); await p.reload({waitUntil:'networkidle'});
  await p.waitForTimeout(450);
  await ev(()=>{
    [['s',0.35],['d',0.15],['K',0.7]].forEach(([k,v])=>{
      document.getElementById('addsel').value = k;
      document.getElementById('add').click();
      const i = shocks.length-1;
      const n = document.getElementById('nk'+i+'-'+k);
      n.value = String(v).replace('.',','); n.dispatchEvent(new Event('change',{bubbles:true}));
    });
  });
  await p.waitForTimeout(700);
  const m3 = await marks();
  ok('три шока: old, k₁, k₂, k₃, скачок, new',
     JSON.stringify(m3.slice().sort()) === JSON.stringify(['k₁','k₂','k₃','new','old','скачок'].sort()), m3);
  ok('и «new» по-прежнему одна', m3.filter(x => x.indexOf('new') === 0).length === 1, m3);

  /* ---- развилка: две диаграммы там, где одна соврала бы ---- */
  const fork = async i => { await load(i); return ev(()=>{
    const f = forkCase();
    return {key: f && f.key, two: !document.getElementById('fork2').hidden};
  }); };
  for (const i of [0, 1, 2]){
    const f = await fork(i);
    ok('задача ' + (i+1) + ': α не меняется — развилки нет', f.key === null && !f.two, f);
  }
  for (const i of [3, 4]){
    const f = await fork(i);
    ok('задача ' + (i+1) + ': α меняется при свободном параметре — две диаграммы',
       f.key !== null && f.two, f);
  }
  ok('две картинки стоят по разные стороны от k = 1', await ev(()=>{
    const f = forkCase(), dep = q => q.d + q.n + q.g;
    const [lo, hi] = f.cases.map(c => c.vals);
    return lo.s < dep(lo) && hi.s > dep(hi);
  }));
  ok('и подписаны они «k < 1» и «k > 1»',
     JSON.stringify(await ev(()=>forkCase().cases.map(c=>c.text))) === '["k < 1","k > 1"]',
     await ev(()=>forkCase().cases.map(c=>c.text)));
  ok('знак выпуска в них противоположный — ради этого всё и затевалось',
     await ev(()=>{
       const pw = (k, p) => Math.pow(k, p.a);
       const yAt = q => Math.log(pw(kStar(q), finalP(q))) - Math.log(pw(kStar(q), q));
       const [lo, hi] = forkCase().cases.map(c => c.vals);
       return yAt(lo) * yAt(hi) < 0;
     }));
  ok('в ряду траекторий столько же рядов, сколько случаев', await ev(()=>{
       revealed = true; renderHeavy();
       return document.querySelectorAll('#pathrows .pathgrid').length === forkCase().cases.length;
     }));
  ok('там, где направление не определено, вместо кривой вопрос', await ev(()=>{
       const q = document.querySelectorAll('#pathrows .pathq').length;
       const c = document.querySelectorAll('#pathrows canvas').length;
       return q > 0 && q + c === 4 * forkCase().cases.length;
     }));
  ok('всё задано — развилки нет даже при шоке по α', await ev(()=>{
    PKEYS.forEach(k => base[k].fixed = true);
    refreshAll();
    const f = forkCase();
    return f === null && document.getElementById('fork2').hidden;
  }));

  ok('ошибок в консоли нет', errs.length === 0, errs);
  await b.close();
  const fails = R.filter(r=>r[0]==='FAIL');
  R.forEach(r=>console.log(r[0].padEnd(5), r[1], r[2] ? '  '+r[2].slice(0,180) : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

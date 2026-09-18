/* Геометрия подписей на канвасе: наложения и выходы за поле
 *
 * Запуск: node check/ui-canvas.js   (нужен playwright и python3 -m http.server 8000)
 * Браузер — CHROME_PATH, адрес — URL. Проще всего: bash check/all.sh
 *
 * Канвас не даёт себя осмотреть разметкой: подпись, севшая на соседнюю,
 * тестами не ловилась и находилась только глазами. Поэтому здесь
 * перехватывается сам вывод текста, у каждой подписи считается рамка,
 * и проверяется, что рамки не пересекаются и не вылезают за канвас.
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

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await b.newContext({viewport:{width:1500,height:1100}})).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  const ev = (f,a) => p.evaluate(f,a);
  await p.goto(BASE, {waitUntil:'networkidle'});
  await p.waitForTimeout(450);

  await ev(()=>{
    window.__boxes = [];
    const proto = CanvasRenderingContext2D.prototype, orig = proto.fillText;
    proto.fillText = function(t, x, y, mw){
      try {
        if (this.canvas && /^(main|main2|path-)/.test(this.canvas.id) && String(t).trim()){
          const w = this.measureText(String(t)).width;
          const size = parseFloat(/(\d+(\.\d+)?)px/.exec(this.font || '')?.[1] || '12');
          const ax = this.textAlign === 'center' ? x - w/2 : this.textAlign === 'right' ? x - w : x;
          const ay = this.textBaseline === 'middle' ? y - size*0.55
                   : this.textBaseline === 'top' ? y : y - size*0.8;
          window.__boxes.push({t:String(t), x:ax, y:ay, w, h:size*1.05, id:this.canvas.id});
        }
      } catch (e) {}
      return orig.call(this, t, x, y, mw);
    };
  });

  const CASES = [
    ['задача 1', {prob:0}], ['задача 2', {prob:1}], ['задача 3', {prob:2}],
    ['задача 4', {prob:3}], ['задача 5', {prob:4}],
    ['три шока K, L, α', {shocks:[['K','mul',.8],['L','mul',1.25],['a','add',.05]]}],
    ['три шока s, δ, n', {shocks:[['s','set',.9],['d','add',.4],['n','set',.5]]}],
    ['α вниз', {shocks:[['a','add',-.2]]}],
    ['K вверх втрое', {shocks:[['K','mul',3]]}],
    ['L вниз в двадцать раз', {shocks:[['L','mul',.05]]}],
    ['α почти единица', {base:{a:[.95,1]}, shocks:[['s','set',.9]]}],
    ['α мала', {base:{a:[.05,1]}, shocks:[['s','set',.9]]}],
    ['golden rule', {shocks:[['s','set',.3]], gold:true}],
  ];
  let outFail = null, overFail = null, emptyFail = null, errFail = null, seen = 0;
  for (const W of [1500, 900, 390]){
    await p.setViewportSize({width:W, height:1100}); await p.waitForTimeout(280);
    for (const [name, C] of CASES){
      errs.length = 0;
      await ev(()=>{ location.hash=''; resetAll(); refreshAll(); }); await p.waitForTimeout(110);
      if (C.prob !== undefined) await ev(i=>loadProblem(i), C.prob);
      if (C.base) await ev(bb=>{ Object.entries(bb).forEach(([k,[v,f]])=>{
        base[k] = {v: clampKey(k,v), fixed: !!f, def: clampKey(k,v)}; }); }, C.base);
      if (C.shocks) await ev(ss=>{ shocks = ss.map(([key,form,value],j)=>
        ({key, form, value: clampKey(key,value,form), on:true, ci:j})); }, C.shocks);
      if (C.gold) await ev(()=>{ showGold = true; });
      await ev(()=>{ revealed = true; refreshAll(); }); await p.waitForTimeout(430);
      await ev(()=>{ window.__boxes = []; drawMain(); drawPaths(); }); await p.waitForTimeout(160);
      const r = await ev(()=>{
        const ids = ['main','main2'].concat([...document.querySelectorAll('#pathrows canvas')].map(c=>c.id));
        const out = {};
        ids.forEach(id => {
          const cv = document.getElementById(id);
          if (!cv || (id === 'main2' && document.getElementById('fork2').hidden)) return;
          const W = cv.clientWidth, H = +(cv.dataset.hNow || cv.dataset.h);
          const bx = window.__boxes.filter(q => q.id === id);
          const outside = bx.filter(q => q.x < -1 || q.y < -1 || q.x + q.w > W + 1 || q.y + q.h > H + 1)
                            .map(q => q.t);
          const over = [];
          for (let i = 0; i < bx.length; i++)
            for (let j = i+1; j < bx.length; j++){
              const a = bx[i], c = bx[j];
              const ix = Math.min(a.x+a.w, c.x+c.w) - Math.max(a.x, c.x);
              const iy = Math.min(a.y+a.h, c.y+c.h) - Math.max(a.y, c.y);
              if (ix > 0 && iy > 0 && ix*iy > Math.min(a.w*a.h, c.w*c.h)*0.45)
                over.push(a.t + ' / ' + c.t);
            }
          out[id] = {n: bx.length, outside, over: over.slice(0,3)};
        });
        return out;
      });
      const tag = name + ' @ ' + W;
      if (errs.length) errFail = errFail || {tag, errs: errs.slice(0,2)};
      Object.entries(r).forEach(([id, q]) => {
        seen += q.n;
        if (!q.n) emptyFail = emptyFail || {tag, id};
        if (q.outside.length) outFail = outFail || {tag, id, out: q.outside.slice(0,3)};
        if (q.over.length) overFail = overFail || {tag, id, over: q.over};
      });
    }
  }
  ok('отрисовка не роняет страницу', !errFail, errFail);
  ok('на каждом канвасе есть подписи', !emptyFail, emptyFail);
  ok('ни одна подпись не вылезает за канвас (' + seen + ' подписей)', !outFail, outFail);
  ok('подписи не садятся друг на друга', !overFail, overFail);

  await b.close();
  const fails = R.filter(r=>r[0]==='FAIL');
  R.forEach(r=>console.log(r[0].padEnd(5), r[1], r[2] ? '  '+r[2] : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

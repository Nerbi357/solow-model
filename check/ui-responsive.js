/* Лестница ширин: 1600 / 1280 / 768 / 390
 *
 * Запуск: node check/ui-responsive.js   (нужен playwright и python3 -m http.server 8000)
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
  const errs = [];
  const look = async (w, h, touch) => {
    const ctx = await b.newContext({viewport:{width:w,height:h}, deviceScaleFactor:2,
      isMobile:touch, hasTouch:touch});
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(w + ': ' + e.message));
    await p.goto(BASE, {waitUntil:'networkidle'});
    await p.waitForTimeout(450);
    await p.evaluate(()=>document.querySelector('[data-p="1"]').click());
    await p.waitForTimeout(650);
    const r = await p.evaluate(()=>{
      const cv = document.getElementById('main');
      const t = document.querySelector('.fx-wrap') || document.querySelector('.fx').parentElement;
      const pin = document.querySelector('.pin'), rng = document.querySelector('input[type=range]');
      return {
        h: cv.clientHeight, cw: cv.clientWidth,
        touch: getComputedStyle(cv).touchAction,
        cards: getComputedStyle(document.querySelector('.fx')).display === 'block',
        tableScrollX: t.scrollWidth > t.clientWidth + 1,
        pageScrollX: document.documentElement.scrollWidth > window.innerWidth + 1,
        pinH: Math.round(pin.getBoundingClientRect().height),
        rngH: Math.round(rng.getBoundingClientRect().height),
        hint: !!document.getElementById('helpbtn') &&
              getComputedStyle(document.getElementById('helpbtn')).display !== 'none',
        cells: [...document.querySelectorAll('#fx td.v')].length
      };
    });
    await ctx.close();
    return r;
  };

  const wide = await look(1600, 1000, false);
  ok('1600: график прежней высоты', wide.h === 618, wide.h);
  ok('1600: таблица осталась таблицей', !wide.cards);
  ok('1600: кнопка подсказки на месте', wide.hint);

  const lap = await look(1280, 900, false);
  ok('1280 (ноутбук): график не ужался', lap.h === 618, lap.h);
  ok('1280: таблица осталась таблицей', !lap.cards);

  const tab = await look(768, 1024, true);
  ok('768 (планшет): график прежней высоты', tab.h === 618, tab.h);
  ok('768: таблица осталась таблицей', !tab.cards);
  ok('768: мишени крупнее (тач)', tab.pinH >= 24 && tab.rngH >= 28, {pin:tab.pinH, rng:tab.rngH});
  ok('768: кнопка подсказки тоже на месте', tab.hint);

  const ph = await look(390, 844, true);
  ok('390: график горизонтальный, а не колодец', ph.h < ph.cw, {h:ph.h, w:ph.cw});
  ok('390: свайп прокручивает страницу', ph.touch === 'pan-y', ph.touch);
  ok('390: таблица карточками', ph.cards);
  ok('390: горизонтальной прокрутки у таблицы нет', !ph.tableScrollX);
  ok('390: страница не едет вбок', !ph.pageScrollX);
  ok('390: все восемь клеток на месте', ph.cells === 24, ph.cells);
  ok('390: мишени не меньше 24 px', ph.pinH >= 24 && ph.rngH >= 28, {pin:ph.pinH, rng:ph.rngH});

  ok('ошибок на странице нет', errs.length === 0, errs);
  await b.close();
  const fails = R.filter(r=>r[0]==='FAIL');
  R.forEach(r=>console.log(r[0].padEnd(5), r[1], r[2] ? '  '+r[2].slice(0,120) : ''));
  console.log('\n' + (R.length-fails.length) + '/' + R.length + ' пройдено');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

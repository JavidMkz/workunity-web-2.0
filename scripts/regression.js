const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const RU = /[А-Яа-яЁё]/;
const BANNED = /\b(recruiter|staffing agency)\b|кадровое агентство|рекрутинг/i;
// An affirmative promise of a visa/permit/entry/job. Negated statements
// ("we do NOT guarantee a visa") are disclaimers, not violations, so they
// are excluded; split on newlines too, or list items merge into one blob.
const G_WORD = /(гарант\w*|guarantee\w*|guaranteed)/i;
const G_TARGET = /(виз[аыуе]|разрешени|выезд|въезд|трудоустройств|visa|permit|departure|employment)/i;
// \b is ASCII-only in JS, so Cyrillic needs explicit Unicode boundaries
const G_NEG = /\b(not|never|no|without|nor|nothing)\b|(?<!\p{L})(не|нет|без|никогда|запрещ\w*)(?!\p{L})/iu;
function guaranteePromises(text){
  return text.split(/(?<=[.!?])\s+|\n+/)
    .map(x => x.trim())
    .filter(x => G_WORD.test(x) && G_TARGET.test(x) && !G_NEG.test(x));
}
const NAV_HREFS = ['index.html','inostrantsam.html','partners.html','o-workunity.html'];
// index.html carries one extra nav item (Аудит документов) that the other
// dict-based pages deliberately don't — see PAGES comment below.
const NAV_HREFS_HOME = [...NAV_HREFS, 'audit.html'];
const PAGES = [
  ['index.html',        'employers',  '#contact', undefined, NAV_HREFS_HOME],
  ['o-workunity.html',  'about',      '#bridge'],
  ['partners.html',     'partners',   '#cta-form'],
  ['inostrantsam.html', 'foreigners', '#cta-form'],
  ['kak-nanyat-inostrannogo-rabotnika.html', 'guide', 'index.html'],
  ['check-job-offer.html', 'check', 'inostrantsam.html#cta-form'],
  // audit.html: minimal header (no #mainnav), so nav/navOn checks are skipped for it;
  // its mobile CTA points at the on-page form, not the shared consultation anchor.
  ['audit.html', 'audit', 'index.html', '#form', null],
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let fail = 0, checks = 0;
  const bad = m => { console.log('   ✗ ' + m); fail++; };
  const ok  = () => { checks++; };

  // ── per page × language × theme ─────────────────────────────────────
  for (const [page, slug, ctaHref, mctaHrefOverride, navHrefsOverride = NAV_HREFS] of PAGES) {
    const mctaHref = mctaHrefOverride !== undefined ? mctaHrefOverride : ctaHref;
    console.log('\n── ' + page);
    for (const theme of ['light','dark']) {
      for (const lang of ['ru','en','ur']) {
        const c = await b.newContext({ viewport:{width:1280,height:900} });
        await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
        const p = await c.newPage(); const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type()==='error' && !/ERR_FAILED|fonts\./.test(m.text())) errs.push(m.text()); });
        // язык задаётся адресом страницы, а не localStorage
        const langDir = lang === 'ru' ? '' : lang + '/';
        await p.goto('http://localhost:8731/' + langDir + page);
        await p.evaluate(t => { try{ localStorage.setItem('wu_theme',t); }catch(e){} }, theme);
        await p.reload({ waitUntil:'domcontentloaded' }); await p.waitForTimeout(280);

        const r = await p.evaluate(() => {
          const t = e => e ? e.textContent.replace(/\s+/g,' ').trim() : null;
          const cs = e => e ? getComputedStyle(e) : null;
          return {
            lang: document.documentElement.lang, dir: document.documentElement.dir,
            theme: document.documentElement.getAttribute('data-theme') || 'light',
            dataPage: document.body.getAttribute('data-page'),
            title: document.title,
            ogLocale: (document.querySelector('meta[property="og:locale"]')||{}).content,
            desc: (document.querySelector('meta[name="description"]')||{}).content,
            nav: [...document.querySelectorAll('#mainnav a')].map(a => a.getAttribute('href')),
            navOn: [...document.querySelectorAll('#mainnav a.on')].length,
            ctaHref: (document.querySelector('.hdr__cta')||{}).getAttribute ? document.querySelector('.hdr__cta').getAttribute('href') : null,
            mctaHref: (document.querySelector('.mcta__go')||{}).getAttribute ? document.querySelector('.mcta__go').getAttribute('href') : null,
            footReg: (t(document.querySelector('.ftr__b'))||'').includes('00408202610480'),
            copyright: t(document.querySelector('.ftr__b span')),
            shadowNav: [...document.querySelectorAll('.ftr a')].map(t)
              .filter(x => ['Страны','Решения','Процедура','Countries','Solutions','Process','Geography','Services'].includes(x)),
            bodyText: document.body.innerText,
            bodyBg: cs(document.body).backgroundColor, bodyColor: cs(document.body).color,
            ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            emptyI18n: [...document.querySelectorAll('[data-i18n],[data-en]')]
              .filter(e => !(e.textContent||'').trim()).length,
          };
        });

        const tag = `${lang}/${theme}`;
        if (r.lang !== lang) bad(`${tag} html lang=${r.lang}`); else ok();
        if (r.dir !== (lang==='ur' ? 'rtl' : 'ltr')) bad(`${tag} dir=${r.dir}`); else ok();
        if (r.theme !== theme) bad(`${tag} theme=${r.theme}`); else ok();
        if (r.dataPage !== slug) bad(`${tag} data-page=${r.dataPage}`); else ok();
        if (r.ogLocale !== {ru:'ru_RU',en:'en_US',ur:'ur_PK'}[lang]) bad(`${tag} og:locale=${r.ogLocale}`); else ok();
        if (navHrefsOverride === null) {
          if (r.nav.length) bad(`${tag} expected no #mainnav, found ${r.nav}`); else ok();
        } else {
          if (JSON.stringify(r.nav) !== JSON.stringify(navHrefsOverride)) bad(`${tag} nav=${r.nav}`); else ok();
          if (r.navOn !== 1) bad(`${tag} active nav items=${r.navOn}`); else ok();
        }
        if (r.ctaHref !== ctaHref) bad(`${tag} header CTA=${r.ctaHref} want ${ctaHref}`); else ok();
        if (r.mctaHref !== mctaHref) bad(`${tag} mobile CTA=${r.mctaHref} want ${mctaHref}`); else ok();
        if (!r.footReg) bad(`${tag} reg number missing in footer`); else ok();
        if (r.copyright !== '© 2026 WorkUnity') bad(`${tag} copyright bidi: "${r.copyright}"`); else ok();
        if (r.shadowNav.length) bad(`${tag} shadow nav: ${r.shadowNav}`); else ok();
        if (r.ov > 0) bad(`${tag} overflow ${r.ov}px`); else ok();
        if (r.emptyI18n) bad(`${tag} ${r.emptyI18n} empty i18n nodes`); else ok();
        if (r.bodyBg === r.bodyColor) bad(`${tag} body bg == text colour`); else ok();
        if (BANNED.test(r.title) || BANNED.test(r.desc||'')) bad(`${tag} banned wording in metadata`); else ok();
        const gp = guaranteePromises(r.bodyText);
        if (gp.length) bad(`${tag} affirmative guarantee: "${gp[0].slice(0,90)}"`); else ok();
        if (lang !== 'ru' && RU.test(r.title)) bad(`${tag} RU leak in title`); else ok();
        if (errs.length) bad(`${tag} console: ${JSON.stringify(errs.slice(0,2))}`); else ok();
        await c.close();
      }
    }
    console.log('   done');
  }

  // ── responsive sweep, burger open ───────────────────────────────────
  console.log('\n── responsive (320-1920, burger open)');
  for (const w of [320,375,390,430,768,900,1099,1100,1280,1600,1920]) {
    const c = await b.newContext({ viewport:{width:w,height:840} });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const p = await c.newPage(); const rows = [];
    for (const [page] of PAGES) for (const lang of ['ru','en','ur']) {
      await p.goto('http://localhost:8731/' + (lang === 'ru' ? '' : lang + '/') + page);
      await p.waitForTimeout(170);
      const ov = await p.evaluate(() => {
        const bg = document.querySelector('#burger');
        if (bg && getComputedStyle(bg).display !== 'none') bg.click();
        return new Promise(res => setTimeout(() => res(
          document.documentElement.scrollWidth - document.documentElement.clientWidth), 110));
      });
      if (ov > 0) rows.push(`${page}/${lang} ${ov}px`);
    }
    if (rows.length) { rows.forEach(x => bad(`w=${w} ${x}`)); } else ok();
    console.log(`   w=${w}: ${rows.length ? 'FAIL' : 'ok'}`);
    await c.close();
  }

  // ── cross-page link integrity ───────────────────────────────────────
  console.log('\n── link integrity');
  const c = await b.newContext({ viewport:{width:1280,height:900} });
  await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await c.newPage();
  const seen = new Set();
  for (const [page] of PAGES) {
    await p.goto('http://localhost:8731/' + page); await p.waitForTimeout(200);
    const links = await p.evaluate(() => [...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href')).filter(h => h && !/^(https?:|tel:|mailto:|#)/.test(h)));
    for (const h of new Set(links)) {
      const file = h.split('#')[0];
      if (!file || seen.has(file)) continue;
      seen.add(file);
      const res = await p.evaluate(async u => (await fetch(u, {method:'HEAD'})).status, 'http://localhost:8731/' + file);
      if (res !== 200) bad(`broken link ${file} (${res}) from ${page}`); else ok();
    }
    // in-page anchors
    const anchors = await p.evaluate(() => [...document.querySelectorAll('a[href^="#"]')]
      .map(a => a.getAttribute('href')).filter(h => h.length > 1));
    for (const a of new Set(anchors)) {
      const exists = await p.evaluate(h => !!document.querySelector(h), a);
      if (!exists) bad(`dead anchor ${a} on ${page}`); else ok();
    }
  }
  console.log(`   checked ${seen.size} files + in-page anchors`);
  await c.close();
  await b.close();

  console.log('\n' + '='.repeat(52));
  console.log(fail ? `REGRESSION FAILURES: ${fail}` : `ALL ${checks} REGRESSION CHECKS PASSED`);
})();

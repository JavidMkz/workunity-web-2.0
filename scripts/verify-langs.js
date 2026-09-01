#!/usr/bin/env node
/**
 * Проверка языковых версий.
 *
 * Смотрит на сайт глазами поискового робота: JavaScript отключён, поэтому
 * видно ровно то, что попадает в индекс. Проверяются язык и направление
 * письма, наличие перевода в самой разметке, hreflang, canonical, доступность
 * картинок из подпапок, ссылки переключателя и корректность Schema.org.
 *
 *   node scripts/verify-langs.js
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = process.env.WU_LOCAL_ORIGIN || 'http://localhost:8731';
const ORIGIN = 'https://workunityglobe.com/';
const FILES = ['index.html', 'inostrantsam.html', 'partners.html',
               'o-workunity.html', 'audit.html', 'kak-nanyat-inostrannogo-rabotnika.html',
               'check-job-offer.html'];
const LANGS = ['ru', 'en', 'ur'];
// характерная строка, которая обязана быть в разметке на этом языке
const MARK = {
  ru: /[А-Яа-яЁё]{4}/,
  en: /[A-Za-z]{4}/,
  ur: /[؀-ۿ]{3}/
};

let fail = 0;
const bad = (m) => { console.log('  ✗ ' + m); fail++; };

const dirOf = (lang) => (lang === 'ru' ? '' : lang + '/');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();

  for (const lang of LANGS) {
    console.log(`\n=== ${lang.toUpperCase()} ===`);
    for (const file of FILES) {
      const url = `${BASE}/${dirOf(lang)}${file}`;
      const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (!res || res.status() !== 200) { bad(`${url} -> HTTP ${res ? res.status() : '?'}`); continue; }

      const r = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const alts = [...document.querySelectorAll('link[rel="alternate"][hreflang]')]
          .map(l => l.getAttribute('hreflang') + '=' + l.getAttribute('href'));
        let ld = null, ldErr = null;
        const el = q('script[type="application/ld+json"]');
        if (el) { try { ld = JSON.parse(el.textContent); } catch (e) { ldErr = e.message; } }
        return {
          lang: document.documentElement.getAttribute('lang'),
          dir: document.documentElement.getAttribute('dir'),
          title: document.title,
          desc: (q('meta[name="description"]') || {}).content || '',
          canonical: (q('link[rel="canonical"]') || {}).getAttribute
            ? q('link[rel="canonical"]').getAttribute('href') : null,
          alts,
          // .f-langs__row — намеренный список языков поддержки («Русский ·
          // English · हिन्दी · اردو»), он одинаков во всех версиях
          text: (() => {
            const c = document.body.cloneNode(true);
            // скрипты в body содержат русские словари — это не видимый текст
            c.querySelectorAll('script,style,template,.f-langs__row').forEach(n => n.remove());
            // без обрезки: подвал на длинных страницах иначе не проверяется,
            // и непереведённые ссылки в нём проходят мимо
            return c.textContent;
          })(),
          imgs: [...document.querySelectorAll('img[src]')].map(i => i.getAttribute('src')),
          swLinks: [...document.querySelectorAll('#lsw a')].map(a => a.getAttribute('href')),
          ld, ldErr,
          types: ld && ld['@graph'] ? ld['@graph'].map(g => g['@type']) : []
        };
      });

      const tag = `${dirOf(lang)}${file}`;

      if (r.lang !== lang) bad(`${tag}: <html lang> = ${r.lang}, ожидалось ${lang}`);
      const wantDir = lang === 'ur' ? 'rtl' : 'ltr';
      if (r.dir !== wantDir) bad(`${tag}: <html dir> = ${r.dir}, ожидалось ${wantDir}`);

      // перевод должен быть в самой разметке, без JS
      if (!MARK[lang].test(r.text)) bad(`${tag}: в разметке нет текста на языке ${lang}`);
      if (lang !== 'ru' && MARK.ru.test(r.text.replace(/Бишкек|Кыргызстан/g, '')))
        bad(`${tag}: в версии ${lang} осталась кириллица`);

      if (!r.title) bad(`${tag}: пустой <title>`);
      if (!r.desc) bad(`${tag}: пустой description`);

      const wantCanon = ORIGIN + dirOf(lang) + (file === 'index.html' ? '' : file);
      if (r.canonical !== wantCanon) bad(`${tag}: canonical = ${r.canonical}, ожидался ${wantCanon}`);

      if (r.alts.length !== 4) bad(`${tag}: hreflang-ссылок ${r.alts.length}, ожидалось 4`);
      LANGS.concat('x-default').forEach(l => {
        if (!r.alts.some(a => a.startsWith(l + '='))) bad(`${tag}: нет hreflang="${l}"`);
      });

      // картинки должны существовать
      for (const src of r.imgs) {
        if (/^(https?:|data:)/.test(src)) continue;
        const abs = new URL(src, url).href;
        const head = await ctx.request.get(abs).catch(() => null);
        if (!head || head.status() !== 200) bad(`${tag}: не грузится картинка ${src}`);
      }

      // ссылки переключателя должны вести на существующие страницы
      if (r.swLinks.length !== 3) bad(`${tag}: в переключателе ${r.swLinks.length} ссылок, ожидалось 3`);
      for (const href of r.swLinks) {
        const abs = new URL(href, url).href;
        const got = await ctx.request.get(abs).catch(() => null);
        if (!got || got.status() !== 200) bad(`${tag}: битая ссылка языка ${href}`);
      }

      // структурированные данные
      if (r.ldErr) bad(`${tag}: JSON-LD не разбирается — ${r.ldErr}`);
      else if (!r.ld) bad(`${tag}: нет блока JSON-LD`);
      else {
        ['Organization', 'WebSite', 'WebPage'].forEach(t => {
          if (!r.types.includes(t)) bad(`${tag}: в JSON-LD нет ${t}`);
        });
        const page404 = r.ld['@graph'].find(g => g['@type'] === 'WebPage');
        if (page404 && page404.inLanguage !== lang)
          bad(`${tag}: WebPage.inLanguage = ${page404.inLanguage}, ожидался ${lang}`);
      }

      console.log(`  ok ${tag.padEnd(46)} ${r.types.join(', ')}`);
    }
  }

  // карта сайта
  console.log('\n=== sitemap.xml ===');
  const sm = await ctx.request.get(`${BASE}/sitemap.xml`);
  if (sm.status() !== 200) bad('sitemap.xml недоступен');
  else {
    const xml = await sm.text();
    let n = 0;
    for (const lang of LANGS) for (const file of FILES) {
      const u = ORIGIN + dirOf(lang) + (file === 'index.html' ? '' : file);
      if (xml.includes('<loc>' + u + '</loc>')) n++;
      else bad(`sitemap: нет адреса ${u}`);
    }
    console.log(`  адресов найдено: ${n} из ${LANGS.length * FILES.length}`);
  }

  await ctx.close();
  await browser.close();
  console.log('\n' + (fail ? `ОШИБОК: ${fail}` : 'ВСЕ ЯЗЫКОВЫЕ ВЕРСИИ ПРОВЕРЕНЫ'));
  process.exit(fail ? 1 : 0);
})();

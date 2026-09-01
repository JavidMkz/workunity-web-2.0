#!/usr/bin/env node
/**
 * Сборка языковых версий сайта.
 *
 * Источник правды — русские файлы в корне репозитория вместе со словарями
 * I18N_EN / I18N_UR / SEO внутри них. Скрипт запекает переводы прямо в HTML
 * и раскладывает результат по папкам en/ и ur/, чтобы у каждого языка был
 * собственный адрес, который поисковик индексирует отдельно.
 *
 * Русские файлы при этом НЕ пересобираются целиком — в них вносятся только
 * точечные правки (hreflang, разметка Schema.org, переключатель языка).
 * Так исходник остаётся читаемым, а повторный запуск ничего не ломает.
 *
 *   node scripts/build-langs.js
 *
 * Нужен локальный сервер на WU_LOCAL_ORIGIN (по умолчанию localhost:8731).
 * Страницы открываются в Chromium с ОТКЛЮЧЁННЫМ JavaScript, поэтому следы
 * работы скриптов (тикер, анимации появления, тема) в разметку не попадают.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://workunityglobe.com/';
const LOCAL_ORIGIN = process.env.WU_LOCAL_ORIGIN || 'http://localhost:8731';
const LANGS = ['ru', 'en', 'ur'];
const RTL = { ur: true };

const PAGES = [
  // prerender — блоки, которые рисует скрипт из данных DEST/trades.
  // Их разметку снимаем вторым проходом с включённым JS, чтобы перевод
  // попал в статику и был виден роботу без выполнения скриптов.
  { file: 'index.html', home: true, prerender: ['#dsel', '#dpanel', '#tickRow'],
    name: { ru: 'Главная', en: 'Home', ur: 'ہوم' } },
  { file: 'inostrantsam.html',
    name: { ru: 'Иностранцам', en: 'For Foreigners', ur: 'غیر ملکیوں کے لیے' } },
  { file: 'partners.html',
    name: { ru: 'Партнёрам', en: 'Partners', ur: 'شراکت دار' } },
  { file: 'o-workunity.html',
    name: { ru: 'О WorkUnity', en: 'About WorkUnity', ur: 'WorkUnity کے بارے میں' } },
  { file: 'audit.html',
    name: { ru: 'Бесплатный аудит', en: 'Free Audit', ur: 'مفت آڈٹ' } },
  { file: 'kak-nanyat-inostrannogo-rabotnika.html', howto: true,
    name: { ru: 'Как нанять иностранного работника',
            en: 'How to Hire a Foreign Worker',
            ur: 'غیر ملکی کارکن کو کیسے بھرتی کریں' } },
  // howto здесь намеренно не включён: разделы пронумерованы, но последние из
  // них — не шаги, а признаки обмана и вопросы. Разметка HowTo описывала бы
  // страницу неверно. FAQPage при этом соберётся из блока вопросов.
  { file: 'check-job-offer.html',
    name: { ru: 'Как проверить предложение о работе',
            en: 'How to Check a Job Offer',
            ur: 'نوکری کی پیشکش کیسے جانچیں' } }
];

const SWITCH_LABEL = { ru: 'Язык', en: 'Language', ur: 'زبان' };

const problems = [];
const note = (m) => problems.push(m);

/* ─── адреса ────────────────────────────────────────────── */
const urlFor = (file, lang) =>
  ORIGIN + (lang === 'ru' ? '' : lang + '/') + (file === 'index.html' ? '' : file);

const relLink = (file, from, to) =>
  (from === 'ru' ? '' : '../') + (to === 'ru' ? '' : to + '/') + file;

/* ─── извлечение литералов из исходника ─────────────────── */
function literal(src, name, open) {
  const close = open === '{' ? '\\};' : '\\];';
  const re = new RegExp('^var ' + name + ' = \\' + open + '[\\s\\S]*?\\n' + close, 'm');
  const m = src.match(re);
  if (!m) return null;
  const body = m[0].replace(new RegExp('^var ' + name + ' = '), '').replace(/;$/, '');
  return new Function('return ' + body)();
}

/* ─── разметка переключателя языка ──────────────────────── */
function switcherHtml(file, lang) {
  const parts = [
    { l: 'ru', cls: 'lsw__ru', text: 'RU', extra: '' },
    { l: 'en', cls: 'lsw__en', text: 'EN', extra: '' },
    { l: 'ur', cls: 'lsw__ur', text: 'اردو', extra: ' lang="ur" dir="rtl"' }
  ];
  const inner = parts.map((p, i) => {
    const sep = i ? '<span class="lsw__d">/</span>' : '';
    const cur = p.l === lang ? ' aria-current="true"' : '';
    return `${sep}<a class="${p.cls}" href="${relLink(file, lang, p.l)}" hreflang="${p.l}"${p.extra}${cur}>${p.text}</a>`;
  }).join('');
  return `<div class="lsw" id="lsw" data-lang="${lang}" role="group" aria-label="${SWITCH_LABEL[lang]}">${inner}</div>`;
}

/* ─── теги hreflang ─────────────────────────────────────── */
function altTags(file) {
  const lines = LANGS.map(l =>
    `<link rel="alternate" hreflang="${l}" href="${urlFor(file, l)}">`);
  lines.push(`<link rel="alternate" hreflang="x-default" href="${urlFor(file, 'ru')}">`);
  return lines.join('\n');
}

/* ─── Schema.org: считается из уже переведённого DOM ─────── */
function schemaFromPage(page, args) {
  return page.evaluate((a) => {
    const { lang, canonical, pageName, isHome, howto, origin, title } = a;
    const abs = (p) => origin + p;
    const org = {
      '@type': 'Organization', '@id': abs('#org'), name: 'WorkUnity', url: origin,
      email: 'workunityglobe@gmail.com', telephone: '+996700123445',
      logo: abs('img/logo-full-white.png'),
      address: { '@type': 'PostalAddress', addressLocality: 'Бишкек', addressCountry: 'KG' },
      areaServed: ['Кыргызстан', 'Казахстан', 'Узбекистан', 'Россия', 'Азербайджан',
                   'Беларусь', 'Таджикистан', 'Грузия', 'Украина']
                   .map(n => ({ '@type': 'Country', name: n })),
      slogan: 'Empowering People.'
    };
    const graph = [
      org,
      { '@type': 'WebSite', '@id': abs('#site'), url: origin, name: 'WorkUnity',
        publisher: { '@id': abs('#org') }, inLanguage: lang }
    ];

    const home = origin + (lang === 'ru' ? '' : lang + '/');
    const crumbs = [{ '@type': 'ListItem', position: 1, name: 'WorkUnity', item: home }];
    if (!isHome) crumbs.push({ '@type': 'ListItem', position: 2, name: pageName, item: canonical });

    graph.push({
      '@type': 'WebPage', '@id': canonical + '#page', url: canonical,
      name: title, inLanguage: lang,
      isPartOf: { '@id': abs('#site') }, about: { '@id': abs('#org') },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: crumbs }
    });

    const qa = [];
    document.querySelectorAll('details.q').forEach(d => {
      const sum = d.querySelector('summary');
      const ans = d.querySelector('.q__a');
      if (!sum || !ans) return;
      const clone = sum.cloneNode(true);
      clone.querySelectorAll('.q__i').forEach(n => n.remove());
      const q = clone.textContent.trim();
      const t = ans.textContent.trim();
      if (q && t) qa.push({ '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: t } });
    });
    if (qa.length) graph.push({ '@type': 'FAQPage', '@id': canonical + '#faq', mainEntity: qa });

    let steps = 0;
    if (howto) {
      const list = [];
      document.querySelectorAll('h2').forEach(h => {
        const m = h.textContent.trim().match(/^(\d+)[.)]\s*(.+)$/);
        if (!m) return;
        const sect = h.closest('section') || h.parentElement;
        const p = sect && sect.querySelector('p');
        const text = p ? p.textContent.trim().slice(0, 320) : '';
        list.push({ '@type': 'HowToStep', position: +m[1], name: m[2], text: text || m[2] });
      });
      if (list.length) {
        graph.push({ '@type': 'HowTo', '@id': canonical + '#howto',
          name: title, inLanguage: lang, step: list });
        steps = list.length;
      }
    }
    return { json: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 1),
             faq: qa.length, steps };
  }, args);
}

const LD_OPEN = '<script type="application/ld+json">';
function injectSchema(html, json) {
  const block = LD_OPEN + '\n' + json + '\n</script>';
  const re = /<script type="application\/ld\+json">[\s\S]*?<\/script>/;
  if (re.test(html)) return html.replace(re, block);
  return html.replace('</head>', block + '\n</head>');
}

/* ─── главное ───────────────────────────────────────────── */
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  // отдельный контекст с работающим JS — для снятия разметки скриптовых блоков
  const liveCtx = await browser.newContext({ javaScriptEnabled: true });
  let written = 0;

  for (const spec of PAGES) {
    const srcPath = path.join(ROOT, spec.file);
    const src = fs.readFileSync(srcPath, 'utf8');
    const dicts = { en: literal(src, 'I18N_EN', '{'), ur: literal(src, 'I18N_UR', '{') };
    const attrList = literal(src, 'ATTR_I18N', '[');
    const seo = literal(src, 'SEO', '{');
    if (!seo) note(`${spec.file}: не найден словарь SEO`);

    for (const lang of LANGS) {
      if (lang !== 'ru' && !dicts[lang] && !attrList) {
        note(`${spec.file}: нет словаря для «${lang}»`);
        continue;
      }

      await page.goto(`${LOCAL_ORIGIN}/${spec.file}`, { waitUntil: 'domcontentloaded' });

      /* перевод DOM (для русского ничего не меняем) */
      if (lang !== 'ru') {
        const res = await page.evaluate((a) => {
          const { lang, dict, attrList } = a;
          let n = 0;
          if (dict) {
            document.querySelectorAll('[data-i18n]').forEach(el => {
              const v = dict[el.getAttribute('data-i18n')];
              if (v && v.trim()) { el.innerHTML = v; n++; }
            });
            document.querySelectorAll('[data-i18n-attr]').forEach(el => {
              const p = (el.getAttribute('data-i18n-attr') || '').split(':');
              const v = dict[p[1]];
              if (v && v.trim()) { el.setAttribute(p[0], v); n++; }
            });
          }
          document.querySelectorAll('[data-en]').forEach(el => {
            const v = el.getAttribute(lang === 'en' ? 'data-en' : 'data-ur');
            if (v && v.trim()) { el.innerHTML = v; n++; }
          });
          (attrList || []).forEach(x => {
            const el = document.querySelector(x.sel);
            if (el && x[lang] && x[lang].trim()) { el.setAttribute(x.attr, x[lang]); n++; }
          });
          return n;
        }, { lang, dict: dicts[lang], attrList });
        if (!res) note(`${spec.file} [${lang}]: не применено ни одного перевода`);
      }

      const s = (seo && seo[lang]) || null;
      if (!s) note(`${spec.file}: нет SEO-записи для «${lang}»`);
      const title = s ? s.title : await page.title();

      const schema = await schemaFromPage(page, {
        lang, canonical: urlFor(spec.file, lang), pageName: spec.name[lang],
        isHome: !!spec.home, howto: !!spec.howto, origin: ORIGIN, title
      });

      let html;
      if (lang === 'ru') {
        /* ── русский: только точечные правки исходника ── */
        html = src;
      } else {
        /* ── en / ur: полная сборка из переведённого DOM ── */
        await page.evaluate((a) => {
          const { lang, s, rtl, sub } = a;
          document.documentElement.setAttribute('lang', lang);
          document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
          if (s) {
            document.title = s.title;
            const set = (sel, v) => { const el = document.querySelector(sel); if (el && v) el.setAttribute('content', v); };
            set('meta[name="description"]', s.description);
            set('meta[property="og:title"]', s.ogTitle);
            set('meta[property="og:description"]', s.ogDescription);
            set('meta[property="og:locale"]', s.locale);
          }
          if (sub) {
            document.querySelectorAll('[src],[href]').forEach(el => {
              ['src', 'href'].forEach(attr => {
                const v = el.getAttribute(attr);
                if (v && /^(img|video)\//.test(v)) el.setAttribute(attr, '../' + v);
              });
            });
          }
        }, { lang, s, rtl: !!RTL[lang], sub: true });

        html = '<!doctype html>\n' + await page.evaluate(() => document.documentElement.outerHTML);
      }

      /* ── общие правки для всех трёх языков ── */

      // явные lang/dir в разметке: краулер читает их без выполнения скриптов
      if (lang === 'ru') html = html.replace(/<html lang="ru"[^>]*>/, '<html lang="ru" dir="ltr">');

      // canonical на собственный адрес языка
      const canRe = /<link rel="canonical" href="[^"]*">/;
      const canTag = `<link rel="canonical" href="${urlFor(spec.file, lang)}">`;
      html = canRe.test(html) ? html.replace(canRe, canTag)
                              : html.replace('</head>', canTag + '\n</head>');

      // hreflang: сначала убираем старые, потом ставим свежие
      html = html.replace(/\n?<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '');
      html = html.replace(canTag, canTag + '\n' + altTags(spec.file));

      // переключатель языка -> ссылки (кнопка из исходника или уже собранный блок)
      const swRe = /<(button|div) class="lsw" id="lsw"[\s\S]*?<\/\1>/;
      if (swRe.test(html)) html = html.replace(swRe, switcherHtml(spec.file, lang));
      else note(`${spec.file} [${lang}]: не найден переключатель #lsw`);

      // стартовый язык фиксируем, чтение localStorage убираем — попутно
      // исчезает старая беда с «перетеканием» языка между страницами
      const bootRe = /var savedLang = 'ru';\n[\s\S]*?\nsetLang\(savedLang\);|setLang\('(?:ru|en|ur)'\);/;
      if (bootRe.test(html)) html = html.replace(bootRe, `setLang('${lang}');`);
      else note(`${spec.file} [${lang}]: не найден блок инициализации языка`);

      // клик по переключателю больше не нужен
      html = html.replace(/\s*lsw\.addEventListener\('click', function\(\)\{ setLang\(nextLang\(LANG\)\); \}\);/, '');

      html = injectSchema(html, schema.json);

      const outDir = lang === 'ru' ? ROOT : path.join(ROOT, lang);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, spec.file), html);
      written++;

      /* блоки, которые рисует скрипт: снимаем готовую разметку с включённым JS
         и вклеиваем обратно в статику. Логика перевода не дублируется —
         используется та же, что работает у посетителя. */
      if (spec.prerender && spec.prerender.length && lang !== 'ru') {
        const rel = (lang === 'ru' ? '' : lang + '/') + spec.file;
        const live = await liveCtx.newPage();
        await live.goto(`${LOCAL_ORIGIN}/${rel}`, { waitUntil: 'load' });
        await live.waitForTimeout(350);
        const chunks = await live.evaluate((sels) => {
          const out = {};
          sels.forEach(s => { const el = document.querySelector(s); if (el) out[s] = el.innerHTML; });
          return out;
        }, spec.prerender);
        await live.close();

        const missing = spec.prerender.filter(s => !(s in chunks));
        missing.forEach(s => note(`${rel}: не найден блок ${s} для пре-рендеринга`));

        await page.goto(`${LOCAL_ORIGIN}/${rel}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate((c) => {
          Object.keys(c).forEach(s => {
            const el = document.querySelector(s);
            if (el) el.innerHTML = c[s];
          });
        }, chunks);
        const merged = '<!doctype html>\n' + await page.evaluate(() => document.documentElement.outerHTML);
        fs.writeFileSync(path.join(outDir, spec.file), merged);
      }

      const where = lang === 'ru' ? spec.file : `${lang}/${spec.file}`;
      console.log(`  ${where.padEnd(46)} FAQ:${String(schema.faq).padEnd(2)} HowTo:${schema.steps}`);
    }
  }

  await ctx.close();
  await liveCtx.close();
  await browser.close();

  /* ─── карта сайта: все языковые версии со взаимными ссылками ─── */
  const today = new Date().toISOString().slice(0, 10);
  const PRIORITY = { 'index.html': '1.0', 'inostrantsam.html': '0.8', 'partners.html': '0.8',
                     'o-workunity.html': '0.8', 'audit.html': '0.7',
                     'kak-nanyat-inostrannogo-rabotnika.html': '0.6',
                     'check-job-offer.html': '0.6' };
  const entries = [];
  for (const spec of PAGES) {
    for (const lang of LANGS) {
      const alts = LANGS.map(l =>
        `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(spec.file, l)}"/>`)
        .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(spec.file, 'ru')}"/>`);
      entries.push(
        '  <url>\n' +
        `    <loc>${urlFor(spec.file, lang)}</loc>\n` +
        alts.join('\n') + '\n' +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>monthly</changefreq>\n` +
        `    <priority>${PRIORITY[spec.file] || '0.5'}</priority>\n` +
        '  </url>');
    }
  }
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries.join('\n') + '\n</urlset>\n');
  console.log(`\nsitemap.xml: адресов ${entries.length}`);

  console.log(`Записано файлов: ${written}`);
  if (problems.length) {
    console.log('\nПРОБЛЕМЫ:');
    problems.forEach(p => console.log('  ! ' + p));
    process.exit(1);
  }
  console.log('Проблем нет.');
})();

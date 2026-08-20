#!/usr/bin/env node
/*
 * audit-i18n.js — static RU/EN/UR completeness check for the WorkUnity site.
 *
 * Two i18n mechanisms exist on this site:
 *   1. Dictionary pages (o-workunity.html, partners.html, inostrantsam.html):
 *      RU lives inline in the HTML, I18N_EN / I18N_UR are key->value dictionaries.
 *   2. index.html: RU lives inline, data-en / data-ur attributes hold the
 *      EN/UR translation per element.
 *
 * This script checks, per page: every EN key/attribute has a matching UR
 * key/attribute, no UR value is empty, and the SEO object (where present)
 * has a complete ru/en/ur entry. It does not launch a browser — it only
 * parses the HTML/JS source, so it needs nothing beyond Node itself.
 *
 * Usage: node scripts/audit-i18n.js
 * Exit code 0 = clean, 1 = issues found.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DICT_PAGES = ['o-workunity.html', 'partners.html', 'inostrantsam.html'];
const ATTR_PAGES = ['index.html'];

let issues = 0;
function fail(page, msg) { issues++; console.log(`  [MISSING] ${page}: ${msg}`); }
function ok(msg) { console.log(`  [ok] ${msg}`); }

function parseDict(src, varName) {
  const re = new RegExp(`var ${varName} = \\{`);
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length - 1; // position of opening {
  let depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const body = src.slice(start, i);
  const keyRe = /'([^'\\]+)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  const dict = {};
  let km;
  while ((km = keyRe.exec(body))) dict[km[1]] = km[2];
  return dict;
}

function auditDictPage(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  console.log(`\n${file} (dictionary-based):`);
  const en = parseDict(src, 'I18N_EN');
  const ur = parseDict(src, 'I18N_UR');
  if (!en || !ur) { fail(file, 'could not locate I18N_EN/I18N_UR objects'); return; }
  const enKeys = Object.keys(en), urKeys = Object.keys(ur);
  const missing = enKeys.filter(k => !(k in ur));
  const empty = urKeys.filter(k => !ur[k] || !ur[k].trim());
  const ruFallbackRisk = urKeys.filter(k => ur[k] === en[k] && /[а-яё]/i.test(en[k] || ''));
  if (missing.length) missing.forEach(k => fail(file, `UR key missing: '${k}'`));
  else ok(`all ${enKeys.length} EN keys have a UR counterpart`);
  if (empty.length) empty.forEach(k => fail(file, `UR key empty: '${k}'`));
  else ok('no empty UR values');
  if (ruFallbackRisk.length) ruFallbackRisk.forEach(k => fail(file, `UR value identical to EN and looks non-Urdu: '${k}'`));

  // ENABLED_LANGS must include ur
  if (!/ENABLED_LANGS\s*=\s*\[[^\]]*'ur'/.test(src)) fail(file, "'ur' missing from ENABLED_LANGS");
  else ok("'ur' present in ENABLED_LANGS");

  auditSeo(file, src);
}

function auditSeo(file, src) {
  const m = /var SEO = \{([\s\S]*?)\n\};/.exec(src);
  if (!m) { fail(file, 'SEO object not found'); return; }
  const body = m[1];
  let seoIssues = 0;
  ['ru', 'en', 'ur'].forEach(lang => {
    const langBlockRe = new RegExp(`${lang}:\\s*\\{([\\s\\S]*?)\\n  \\}`);
    const lm = langBlockRe.exec(body);
    if (!lm) { fail(file, `SEO.${lang} block not found`); seoIssues++; return; }
    ['title', 'description', 'ogTitle', 'ogDescription'].forEach(field => {
      if (!new RegExp(`${field}\\s*:`).test(lm[1])) { fail(file, `SEO.${lang}.${field} missing`); seoIssues++; }
    });
  });
  if (!seoIssues) ok('SEO ru/en/ur entries present with title/description/ogTitle/ogDescription');
}

function auditAttrPage(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  console.log(`\n${file} (data-en / data-ur attribute-based):`);
  const enRe = /data-en="((?:[^"\\]|\\.)*)"(\s+data-ur="((?:[^"\\]|\\.)*)")?/g;
  let m, total = 0, missing = 0, empty = 0;
  while ((m = enRe.exec(src))) {
    total++;
    if (!m[2]) { missing++; fail(file, `data-ur missing for data-en="${m[1].slice(0, 40)}..."`); continue; }
    if (!m[3] || !m[3].trim()) { empty++; fail(file, `data-ur empty for data-en="${m[1].slice(0, 40)}..."`); }
  }
  if (!missing) ok(`all ${total} data-en nodes have a data-ur attribute`);
  if (!empty) ok('no empty data-ur values');

  // ATTR_I18N array: every entry needs a ur field
  const attrArrM = /var ATTR_I18N = \[([\s\S]*?)\n\];/.exec(src);
  if (attrArrM) {
    const entries = attrArrM[1].split(/\},\s*\n?\s*\{/).length;
    const urCount = (attrArrM[1].match(/ur\s*:/g) || []).length;
    if (urCount < entries) fail(file, `ATTR_I18N: ${entries - urCount} entr${entries - urCount === 1 ? 'y' : 'ies'} missing a ur field`);
    else ok(`ATTR_I18N: all ${entries} entries have a ur field`);
  }

  // ENABLED_LANGS must include ur
  if (!/ENABLED_LANGS\s*=\s*\[[^\]]*'ur'/.test(src)) fail(file, "'ur' missing from ENABLED_LANGS");
  else ok("'ur' present in ENABLED_LANGS");

  auditSeo(file, src);
}

console.log('WorkUnity i18n audit — RU / EN / UR completeness\n' + '='.repeat(50));
DICT_PAGES.forEach(auditDictPage);
ATTR_PAGES.forEach(auditAttrPage);

console.log('\n' + '='.repeat(50));
if (issues) {
  console.log(`FAILED: ${issues} issue(s) found.`);
  process.exit(1);
} else {
  console.log('PASSED: no missing/empty UR translations found.');
  process.exit(0);
}

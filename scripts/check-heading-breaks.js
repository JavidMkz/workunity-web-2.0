const { chromium } = require('/opt/node22/lib/node_modules/playwright');
// Detect mid-word line breaks by comparing rendered line count against the
// count you'd get if every break landed on a space.
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 let fail=0;
 for(const [page,sel] of [['index.html','.hero h1'],['o-workunity.html','.abt-hero h1']]){
  for(const w of [320,375,430,768,1100,1280,1920]){
   const c=await b.newContext({viewport:{width:w,height:900}});
   await c.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
   const p=await c.newPage();
   const out=[];
   for(const lang of ['ru','en','ur']){
    await p.goto('http://localhost:8731/'+page);
    await p.evaluate(l=>{try{localStorage.setItem('wu_lang',l);}catch(e){}},l=lang);
    await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(450);
    const r=await p.evaluate(s=>{
     const el=document.querySelector(s);
     // walk text nodes, measure each word's client rects
     const rng=document.createRange(); const broken=[];
     const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
     let n; while(n=walk.nextNode()){
      const txt=n.nodeValue; let i=0;
      txt.split(/(\s+)/).forEach(tok=>{
       if(tok.trim()){
        rng.setStart(n,i); rng.setEnd(n,i+tok.length);
        // a word split across lines yields >1 client rect
        if(rng.getClientRects().length>1) broken.push(tok);
       }
       i+=tok.length;
      });
     }
     return {broken, ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};
    },sel);
    if(r.broken.length) out.push(`${lang} split:[${r.broken.join(', ')}]`);
    if(r.ov>0) out.push(`${lang} overflow ${r.ov}px`);
   }
   if(out.length){ console.log(`  ✗ ${page} w=${w}: ${out.join(' | ')}`); fail+=out.length; }
   await c.close();
  }
  console.log(`  ${page}: checked 320-1920`);
 }
 await b.close();
 console.log('\n'+(fail?'MID-WORD BREAKS / OVERFLOW: '+fail:'HEADINGS: no mid-word breaks, no overflow'));
})();

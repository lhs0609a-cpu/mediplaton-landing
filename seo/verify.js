const fs=require('fs'),path=require('path');
const pages=require('./pages.js');
let bad=0, jsonld=0;
const slugs=new Set(pages.map(p=>p.slug));
pages.concat([{slug:'loan-info'}]).forEach(p=>{
  const f=path.join(__dirname,'..',p.slug+'.html');
  if(!fs.existsSync(f)){console.log('MISSING FILE',f);bad++;return;}
  const c=fs.readFileSync(f,'utf8');
  // JSON-LD 파싱
  const m=c.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)||[];
  m.forEach(b=>{
    const j=b.replace(/<script type="application\/ld\+json">/,'').replace(/<\/script>/,'');
    try{JSON.parse(j);jsonld++;}catch(e){console.log('BAD JSON-LD',f,e.message);bad++;}
  });
  if(c.includes('undefined')){console.log('UNDEFINED in',f);bad++;}
  if(!c.includes('</footer>')){console.log('NO FOOTER',f);bad++;}
  if(!c.includes('loan-info.html')){console.log('NO HUB LINK',f);bad++;}
  if(!/<h1>/.test(c)){console.log('NO H1',f);bad++;}
});
// 관련링크 무결성
pages.forEach(p=>(p.related||[]).forEach(r=>{if(!slugs.has(r)){console.log('DEAD related:',p.slug,'->',r);bad++;}}));
console.log(`\n검증 완료 — JSON-LD ${jsonld}개 파싱 성공 / 문제 ${bad}건`);


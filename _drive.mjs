import fs from 'fs';
for (const line of fs.readFileSync('.env.prod.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) { let v=m[2]; if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1); process.env[m[1]]=v; }
}
const tok = process.env.KV_REST_API_TOKEN;
const kvurl = process.env.KV_REST_API_URL;
const BASE = 'https://merlows.vercel.app/api/automation/backfill-heroes';
const log = (...a) => console.log(new Date().toISOString().slice(11,19), ...a);
const cmd = async(a)=>{const r=await fetch(kvurl,{method:'POST',headers:{Authorization:`Bearer ${tok}`,'Content-Type':'application/json'},body:JSON.stringify(a)});return (await r.json()).result;};

async function pendingOpEds() {
  const ids = await cmd(['LRANGE','merlows:automation:jobs:index','0','-1']);
  const heroless=[], withHero=[];
  for (const jid of ids) {
    const jr = await cmd(['GET',`merlows:automation:job:${jid}`]); if(!jr) continue;
    let j; try{j=JSON.parse(jr);}catch{continue;}
    if (j.status!=='pending_review') continue;
    const cr = await cmd(['GET',`merlows:content:${j.contentId}`]); if(!cr) continue;
    let c; try{c=JSON.parse(cr);}catch{continue;}
    if (c.category!=='op-eds') continue;
    const has = typeof c.heroImageUrl==='string' && c.heroImageUrl.startsWith('http');
    (has?withHero:heroless).push(j.contentId);
  }
  return { heroless, withHero };
}

async function call(qs){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r = await fetch(`${BASE}?${qs}`, { headers:{'x-backfill-auth':tok} });
      const j = await r.json().catch(()=>({}));
      if(!r.ok){ log('HTTP',r.status, JSON.stringify(j).slice(0,200)); }
      return j;
    }catch(e){ log('fetch err',e.message,'(retry)'); await new Promise(s=>setTimeout(s,3000)); }
  }
  return { results:[], processed:0 };
}

let totalPub=0, totalImg=0, totalErr=0, iter=0;
const t0=Date.now();
log('=== backfill driver start ===');
const start = await pendingOpEds();
log(`pending op-eds — heroless:${start.heroless.length} withHero:${start.withHero.length}`);

// Phase 1: heroless (generate + publish), 5 per batch
while (iter < 120) {
  iter++;
  const j = await call('limit=5');
  const res = j.results||[];
  const pub = res.filter(r=>r.publish==='approved'||r.publish==='published'||r.publish==='ok').length;
  const img = res.filter(r=>r.heroMediaId).length;
  const err = res.filter(r=>r.error||(r.publish&&String(r.publish).startsWith('err'))).length;
  totalPub+=pub; totalImg+=img; totalErr+=err;
  log(`batch ${iter}: processed ${res.length} | hero+pub ${pub} | err ${err} | running totals pub=${totalPub} err=${totalErr}`);
  for(const r of res) if(r.error||(r.publish&&String(r.publish).startsWith('err'))) log('   ! ', (r.error||r.publish), r.title);
  if ((j.processed||0) === 0) break;
}

// Phase 2: publish the already-have-hero pending op-eds (no image spend)
const rem = await pendingOpEds();
log(`phase 2 — publishing ${rem.withHero.length} with-hero pending`);
let off=0;
while (off < rem.withHero.length) {
  const chunk = rem.withHero.slice(off, off+15);
  const j = await call(`ids=${chunk.join(',')}&limit=15`);
  const res = j.results||[];
  const pub = res.filter(r=>['approved','published','ok'].includes(r.publish)).length;
  totalPub+=pub;
  log(`  pub batch: ${pub}/${chunk.length} (offset ${off})`);
  off += 15;
  if((j.processed||0)===0) break;
}

const fin = await pendingOpEds();
log('=== done ===');
log(`elapsed ${((Date.now()-t0)/60000).toFixed(1)}min | published this run ~${totalPub} | images ~${totalImg} | errors ${totalErr}`);
log(`remaining pending op-eds — heroless:${fin.heroless.length} withHero:${fin.withHero.length}`);

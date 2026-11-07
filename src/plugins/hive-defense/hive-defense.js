// Hive Defense plugin (Nov 6 2026 (Craft), approved demo v2).
// A turn-based hex battle: hills up to 3 floors, hive points for honey,
// call bees at your base, take the wasp nest to win. Practice mode for now:
// it reads your bees but never changes your save.
(() => {
const $ = (id) => document.getElementById(id);

// ---------- Map ----------
// Terrain: g grass, f flower (cover), w water (slow), r rock (blocked), H hive point, B your base, E wasp nest.
const TER=[
 'gfgEggfg',
 'ggggrggg',
 'fgHgggHg',
 'gggrggfg',
 'ggfgggrg',
 'wwwgHwww',
 'grgggfgg',
 'gggfggrg',
 'gHgggHgg',
 'ggrgggfg',
 'fgggfggg',
 'gggBgggg'];
// Height in floors (0–3).
const HGT=[
 '11111000',
 '12210000',
 '13210012',
 '12100123',
 '01000122',
 '00000000',
 '22100000',
 '33210011',
 '32100122',
 '21000123',
 '10000012',
 '00000011'];
const C=8,R=12,S=24,W=Math.sqrt(3)*S,LIFT=5;
const NAME={g:'grass',f:'flower',w:'water',r:'rock',H:'hive',B:'base',E:'nest'};
const COST={grass:1,flower:1,water:2,rock:99,hive:1,base:1,nest:1};
const key=(c,r)=>c+','+r;
const inMap=(c,r)=>c>=0&&c<C&&r>=0&&r<R;
const ter=(c,r)=>NAME[TER[r][c]];
const hgt=(c,r)=>+HGT[r][c];
function nbrs(c,r){const o=r&1?[[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]]:[[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]];return o.map(([a,b])=>[c+a,r+b]).filter(([a,b])=>inMap(a,b))}
function cube(c,r){const q=c-(r-(r&1))/2;return[q,r,-q-r]}
function dist(a,b){const A=cube(a.c,a.r),B=cube(b.c,b.r);return Math.max(Math.abs(A[0]-B[0]),Math.abs(A[1]-B[1]),Math.abs(A[2]-B[2]))}
const px=(c,r)=>[W*(c+.5*(r&1))+W/2+2,S*1.5*r+S+8];

// ---------- Units ----------
const EL={water:'💧',fire:'🔥',wind:'🌪️',earth:'🪨'};
const BEATS={water:'fire',fire:'wind',wind:'earth',earth:'water'};
const ROLES={
 guardian:{icon:'🛡️',label:'Guardian',hp:16,atk:5,def:3,move:3,range:[1,1],el:'earth',cost:8,tip:'Tough front line.'},
 scout:{icon:'🔭',label:'Scout',hp:9,atk:4,def:1,move:5,range:[1,2],el:'wind',cost:5,tip:'Fast. Great for grabbing hive points.'},
 sniper:{icon:'🎯',label:'Sniper',hp:7,atk:6,def:0,move:2,range:[2,4],el:'water',cost:9,tip:'Long-range sting (2–4). Can\'t hit next door. Loves high ground.'},
 nurse:{icon:'🍼',label:'Nurse',hp:10,atk:2,def:1,move:3,range:[1,1],el:'water',cost:6,tip:'Heals a next-door bee for 5 instead of stinging.'},
 barrier:{icon:'🧱',label:'Barrier',hp:20,atk:2,def:4,move:2,range:[1,1],el:'earth',cost:7,tip:'Slow wall. Raiders can\'t pass it.'},
 wasp:{label:'Wasp',hp:8,atk:4,def:1,move:4,range:[1,1],el:'fire',cost:5,tip:'Raider.'},
 spitter:{label:'Spitter',hp:7,atk:4,def:0,move:3,range:[2,3],el:'fire',cost:7,tip:'Ranged raider (2–3).'},
 hornet:{label:'Hornet',hp:14,atk:5,def:2,move:3,range:[1,1],el:'fire',cost:9,tip:'Big raider.'}};
const SHOP=['scout','guardian','nurse','sniper','barrier'];
const FOE_SHOP=['wasp','spitter','hornet'];
let units,owner,honey,turn,phase,sel,log,lost,uid,mode;

// Nov 6 2026 (Craft): your real bees. Talent picks the role (Collectors are Snipers);
// rarity adds a little HP and sting; the bee's element is used for the
// water > fire > wind > earth > water bonus.
const TALENT_ROLE={guardian:'guardian',scout:'scout',collector:'sniper',nurse:'nurse',barrier:'barrier'};
const RANK={Common:0,Rare:1,Epic:2,Legendary:3,Named:3};
let used=new Set();
function hiveBees(){try{return (Vault.getHiveBees()||[]).filter(b=>b.rarity!=='Royal'&&!(typeof beeIsBrood==='function'&&beeIsBrood(b)))}catch{return[]}}
function pickBee(roleName){
  const pool=hiveBees().filter(b=>!used.has(b.id)&&TALENT_ROLE[(typeof beeLockedJob==='function'&&beeLockedJob(b))||b.talent]===roleName)
    .sort((a,z)=>(RANK[z.rarity]||0)-(RANK[a.rarity]||0));
  const b=pool[0];if(b)used.add(b.id);return b||null;
}
function spawn(team,role,c,r,name,ready,bee){const R0=ROLES[role];const k=bee?(RANK[bee.rarity]||0):0;
  const u={id:++uid,team,role,name:name||R0.label,c,r,hp:R0.hp+k*2,max:R0.hp+k*2,atkB:k,elB:bee&&BEATS[bee.element]?bee.element:null,rarity:bee?bee.rarity:'',mp:ready?R0.move:0,hit:!ready};units.push(u);return u}
const atkOf=u=>role(u).atk+(u.atkB||0);
const elOf=u=>u.elB||role(u).el;
function setup(){
  units=[];uid=0;owner={};honey={bee:10,foe:10};turn=1;phase='bee';sel=null;lost=0;mode=null;
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const t=ter(c,r);if(t==='base')owner[key(c,r)]='bee';if(t==='nest')owner[key(c,r)]='foe'}
  used=new Set();
  [['guardian',3,10],['scout',2,11],['sniper',4,11],['nurse',4,10]].forEach(([r,c,rr])=>{const b=pickBee(r);spawn('bee',r,c,rr,b?b.name:ROLES[r].label,1,b)});
  spawn('foe','wasp',2,1,0,1);spawn('foe','wasp',5,1,0,1);spawn('foe','spitter',4,0,0,1);spawn('foe','hornet',3,1,0,1);
  log='Wasps raid from the nest at the top. Grab hive points for honey.';
  $('hd-end').hidden=true;draw();
}
const unitAt=(c,r)=>units.find(u=>u.hp>0&&u.c===c&&u.r===r);
const alive=t=>units.filter(u=>u.hp>0&&u.team===t);
const role=u=>ROLES[u.role];

// Where a unit can go with its move points left. Step up at most 1 floor; climbing costs +1.
function reach(u,mp=u.mp){
  const best=new Map([[key(u.c,u.r),0]]),q=[[u.c,u.r,0]];
  while(q.length){q.sort((a,b)=>a[2]-b[2]);const [c,r,d]=q.shift();
    for(const [a,b] of nbrs(c,r)){const t=ter(a,b);if(t==='rock')continue;const up=hgt(a,b)-hgt(c,r);if(up>1)continue;
      const nd=d+COST[t]+Math.max(0,up);if(nd>mp)continue;const o=unitAt(a,b);if(o&&o.team!==u.team)continue;
      if(!best.has(key(a,b))||best.get(key(a,b))>nd){best.set(key(a,b),nd);q.push([a,b,nd])}}}
  return best;
}
function rangeOf(u,from=u){const [lo,hi]=role(u).range;return [lo,hi+(hi>1&&hgt(from.c,from.r)>=2?1:0)]}
function targets(u){const [lo,hi]=rangeOf(u);return units.filter(o=>o.hp>0&&o.team!==u.team&&dist(u,o)>=lo&&dist(u,o)<=hi)}
function healables(u){return u.role==='nurse'?units.filter(o=>o.hp>0&&o.team===u.team&&o!==u&&o.hp<o.max&&dist(u,o)===1):[]}
function damage(a,d){
  const D=role(d);
  let n=atkOf(a)-D.def-(ter(d.c,d.r)==='flower'?1:0);
  n+=Math.max(-1,Math.min(2,hgt(a.c,a.r)-hgt(d.c,d.r)));
  if(BEATS[elOf(a)]===elOf(d))n=Math.round(n*1.5)+1;
  n+=Math.floor(Math.random()*3)-1;
  return Math.max(1,n);
}
const pops=[];
function sting(a,d){const n=damage(a,d);d.hp=Math.max(0,d.hp-n);pops.push({c:d.c,r:d.r,t:'-'+n,col:'#ff8a96'});
  const up=hgt(a.c,a.r)>hgt(d.c,d.r)?' High ground!':'';const sup=BEATS[elOf(a)]===elOf(d)?' Super effective!':'';
  log=`${a.name} stings ${d.name} for ${n}.${up}${sup}${d.hp?'':` ${d.name} is down.`}`;if(!d.hp&&d.team==='bee')lost++}

// ---------- Drawing ----------
function hexPath(cx,cy,s=S){let p='';for(let i=0;i<6;i++){const a=Math.PI/180*(60*i-30);p+=(i?'L':'M')+(cx+s*Math.cos(a)).toFixed(1)+','+(cy+s*Math.sin(a)).toFixed(1)}return p+'Z'}
const GR=['#2d4a1e','#3d5f26','#507531','#668b3c'],GS=['#1d3013','#283f18','#34501f','#425f26'];
function fillOf(c,r){const t=ter(c,r),h=hgt(c,r);if(t==='water')return'#1f4f7a';if(t==='rock')return'#4a443c';if(t==='flower')return['#45561f','#556a27','#677f30','#79943a'][h];return GR[h]}
function beeSVG(u){
  const foe=u.team==='foe',s=u.role==='hornet'||u.role==='guardian'||u.role==='barrier'?1.08:.95;
  const body=foe?(u.role==='spitter'?'#c94a2c':'#e8641f'):'#ffcc00',st=foe?'#1a0d05':'#1a1000',k=u.hp/u.max,bw=foe?7:9;
  return `<g transform="scale(${s})">
    <ellipse cx="-7" cy="-9" rx="8" ry="5" fill="rgba(230,240,255,.75)" transform="rotate(-25 -7 -9)"/>
    <ellipse cx="7" cy="-9" rx="8" ry="5" fill="rgba(230,240,255,.75)" transform="rotate(25 7 -9)"/>
    <ellipse cx="0" cy="0" rx="${bw}" ry="11" fill="${body}" stroke="${st}" stroke-width="1.5"/>
    <path d="M${-bw} -3H${bw}M${-bw+.5} 3H${bw-.5}" stroke="${st}" stroke-width="2.4"/>
    <circle cx="0" cy="-11" r="4.6" fill="${st}"/><circle cx="-1.8" cy="-12" r="1.1" fill="#fff"/><circle cx="1.8" cy="-12" r="1.1" fill="#fff"/>
    ${foe?'<path d="M0 11 L-2 16 L0 19 L2 16Z" fill="#1a0d05"/>':''}</g>
  <rect x="-12" y="13" width="24" height="4" rx="2" fill="#000"/><rect x="-12" y="13" width="${24*k}" height="4" rx="2" fill="${k>.5?'#7fe08a':k>.25?'#ffcc00':'#ff5a6a'}"/>
  ${foe?(u.role==='spitter'?'<text x="9" y="-8" font-size="10">🏹</text>':''):`<text x="9" y="-8" font-size="10">${role(u).icon}</text>`}`;
}
function draw(){
  const mv=new Set(),tg=new Set(),hl=new Set();
  if(sel&&sel.team==='bee'&&phase==='bee'){
    reach(sel).forEach((d,k)=>{const [a,b]=k.split(',').map(Number);if(!unitAt(a,b))mv.add(k)});
    if(!sel.hit){targets(sel).forEach(o=>tg.add(key(o.c,o.r)));healables(sel).forEach(o=>hl.add(key(o.c,o.r)))}
  }
  let h='';
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const [x,y0]=px(c,r),hh=hgt(c,r),y=y0-hh*LIFT,t=ter(c,r),k=key(c,r);
    if(hh)h+=`<path d="${hexPath(x,y0)}" fill="${GS[hh]}"/><path d="M${x-W/2} ${y0-S/2}L${x-W/2} ${y-S/2}" stroke="#0b0905"/>`;
    h+=`<path class="hex" d="${hexPath(x,y)}" fill="${fillOf(c,r)}" stroke="#0b0905" stroke-width="1.4" data-c="${c}" data-r="${r}"/>`;
    if(hh>=2)h+=`<text x="${x+W/2-11}" y="${y-S/2+10}" font-size="8" fill="rgba(255,255,255,.55)" font-family="monospace" pointer-events="none">▲${hh}</text>`;
    if(t==='flower')h+=`<text x="${x-14}" y="${y+12}" font-size="10" pointer-events="none">🌸</text>`;
    if(t==='rock')h+=`<path d="M${x-10} ${y+8}L${x-4} ${y-8}L${x+4} ${y-5}L${x+11} ${y+8}Z" fill="#6b6359" pointer-events="none"/>`;
    if(t==='hive'||t==='base'||t==='nest'){const o=owner[k];const ring=o==='bee'?'#ffcc00':o==='foe'?'#ff5a6a':'#bbb';
      h+=`<path d="${hexPath(x,y,S-4)}" fill="none" stroke="${ring}" stroke-width="2.5" stroke-dasharray="${o?'':'4 3'}" pointer-events="none"/>`;
      h+=`<text x="${x-9}" y="${y+7}" font-size="17" opacity=".9" pointer-events="none">${t==='hive'?'🍯':t==='base'?'🏠':'🪺'}</text>`}
    const ov=tg.has(k)?'var(--hit)':hl.has(k)?'var(--heal)':mv.has(k)?'var(--move)':'';
    if(ov)h+=`<path d="${hexPath(x,y)}" fill="${ov}" pointer-events="none"/>`;
    if(sel&&sel.c===c&&sel.r===r)h+=`<path d="${hexPath(x,y)}" fill="none" stroke="#fff" stroke-width="2.5" pointer-events="none"/>`;
  }
  units.filter(u=>u.hp>0).sort((a,b)=>a.r-b.r).forEach(u=>{const [x,y0]=px(u.c,u.r),y=y0-hgt(u.c,u.r)*LIFT;const done=u.team==='bee'&&phase==='bee'&&u.hit&&u.mp===0;
    h+=`<g transform="translate(${x},${y-2})" opacity="${done?.5:1}" pointer-events="none">${beeSVG(u)}</g>`});
  pops.splice(0).forEach(p=>{const [x,y]=px(p.c,p.r);h+=`<text class="hd-pop" x="${x-8}" y="${y-18-hgt(p.c,p.r)*LIFT}" fill="${p.col}">${p.t}</text>`});
  const svg=$('hd-map');svg.setAttribute('viewBox',`0 -6 ${Math.ceil(W*(C+.5)+4)} ${Math.ceil(px(0,R-1)[1]+S+6)}`);svg.innerHTML=h;
  $('hd-honey').textContent=`🍯 ${honey.bee} · +${income('bee')}/turn`;
  $('hd-turn').textContent='Turn '+turn;
  $('hd-who').textContent=phase==='bee'?'Your turn':'Wasps move…';$('hd-who').className='hd-pill'+(phase==='bee'?'':' enemy');
  $('hd-endturn').disabled=phase!=='bee';$('hd-log').textContent=log;
  drawPanel();
}
function drawPanel(){
  const u=sel;
  if(mode==='shop'){const free=!!spot('bee');
    $('hd-panel').innerHTML=`<b>🏠 Your base · call a bee</b><small>${free?'New bees arrive at the base and act next turn.':'No room around the base. Move a bee away first.'}</small><div class="hd-shop">${SHOP.map(r=>`<button type="button" class="hd-buy" data-buy="${r}" ${!free||honey.bee<ROLES[r].cost?'disabled':''}><b>${ROLES[r].icon} ${ROLES[r].label}</b><span>🍯 ${ROLES[r].cost}</span></button>`).join('')}</div>`;return}
  $('hd-panel').innerHTML=u?`<b>${u.team==='bee'?role(u).icon+' ':''}${u.name} · ${role(u).label} ${EL[elOf(u)]}${u.rarity?' · '+u.rarity:''} · floor ${hgt(u.c,u.r)}</b>
    <div class="hd-stats"><span>❤️ ${u.hp}/${u.max}</span><span>⚔️ ${atkOf(u)}</span><span>🛡 ${role(u).def}</span><span>👣 ${u.team==='bee'?u.mp+'/':''}${role(u).move}</span><span>🎯 ${rangeOf(u).join('–')}</span></div>
    <small>${role(u).tip}${u.team==='bee'?(u.hit?(u.mp?' Stung. Can still move.':' Done.'):''):''}</small>`
    :'<small>Tap a bee to act. Tap your 🏠 base to call new bees. 💧 beats 🔥 beats 🌪️ beats 🪨 beats 💧.</small>';
}
function baseOf(t){for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(ter(c,r)===(t==='bee'?'base':'nest'))return[c,r]}
function spot(t){const [c,r]=baseOf(t);if(!unitAt(c,r))return[c,r];return nbrs(c,r).find(([a,b])=>!unitAt(a,b)&&ter(a,b)!=='rock'&&ter(a,b)!=='water')||null}
function income(t){return 5+Object.entries(owner).filter(([k,o])=>o===t&&ter(...k.split(',').map(Number))==='hive').length*3}

// ---------- Player input ----------
$('hd-map').addEventListener('click',e=>{
  if(phase!=='bee')return;
  const hx=e.target.closest('[data-c]');if(!hx)return;
  const c=+hx.dataset.c,r=+hx.dataset.r,o=unitAt(c,r);
  if(sel&&sel.team==='bee'){
    if(!sel.hit&&o&&o.team==='foe'&&targets(sel).includes(o)){sting(sel,o);sel.hit=true;return after()}
    if(!sel.hit&&o&&healables(sel).includes(o)){const n=Math.min(5,o.max-o.hp);o.hp+=n;pops.push({c:o.c,r:o.r,t:'+'+n,col:'#7fe08a'});log=`${sel.name} heals ${o.name} for ${n}.`;sel.hit=true;return after()}
    const rch=reach(sel);
    if(!o&&rch.has(key(c,r))){sel.mp-=rch.get(key(c,r));sel.c=c;sel.r=r;
      log=`${sel.name} moves${hgt(c,r)?' to floor '+hgt(c,r):''}.`;if(sel.mp===0&&(sel.hit||(!targets(sel).length&&!healables(sel).length))){sel.hit=true;sel=null}mode=null;draw();return}
    if(o===sel){sel.mp=0;sel.hit=true;log=`${o.name} waits.`;sel=null;draw();return}
  }
  if(!o&&ter(c,r)==='base'){sel=null;mode='shop';draw();return}
  mode=null;sel=o||null;draw();
});
$('hd-panel').addEventListener('click',e=>{const b=e.target.closest('[data-buy]');if(!b||phase!=='bee')return;const r=b.dataset.buy;
  if(honey.bee<ROLES[r].cost)return;honey.bee-=ROLES[r].cost;const sp=spot('bee');if(!sp)return;const [c,rr]=sp;const hb=pickBee(r);
  spawn('bee',r,c,rr,hb?hb.name:ROLES[r].label,0,hb);log=`${units[units.length-1].name} (${ROLES[r].label}) answers the call. It acts next turn.`;mode=null;draw()});
function after(){draw();checkEnd()}
$('hd-endturn').onclick=()=>enemyTurn();$('hd-restart').onclick=setup;$('hd-again').onclick=setup;

// Claim hive points / bases a side ends its turn on.
function claim(t){units.filter(u=>u.hp>0&&u.team===t).forEach(u=>{const k=key(u.c,u.r),tt=ter(u.c,u.r);
  if((tt==='hive'||tt==='base'||tt==='nest')&&owner[k]!==t){owner[k]=t;log=`${u.name} claims ${tt==='hive'?'a hive point':tt==='nest'?'the wasp nest!':'your base!'}`}})}
function checkEnd(){
  const nest=key(...baseOf('foe')),base=key(...baseOf('bee'));
  if(owner[nest]==='bee'||!alive('foe').length&&honey.foe<5)return finish(true),true;
  if(owner[base]==='foe'||!alive('bee').length&&honey.bee<5)return finish(false),true;
  return false;
}

// ---------- Wasp turn ----------
function enemyTurn(){
  if(phase!=='bee')return;claim('bee');if(checkEnd())return;
  phase='foe';sel=null;mode=null;honey.foe+=income('foe');
  // Call a raider if the nest is free.
  // Call one raider a turn around the nest (at most 7 on the field).
  const ready=alive('foe');
  for(let n=0;n<1&&ready.length<7;n++){const sp=spot('foe');if(!sp)break;const pick=honey.foe>=9&&Math.random()<.35?'hornet':honey.foe>=7&&Math.random()<.5?'spitter':'wasp';if(honey.foe<ROLES[pick].cost)break;honey.foe-=ROLES[pick].cost;spawn('foe',pick,sp[0],sp[1],0,0)}
  draw();
  const foes=ready;let i=0;
  const step=()=>{
    if(i>=foes.length){claim('foe');if(checkEnd())return;phase='bee';turn++;honey.bee+=income('bee');units.forEach(u=>{u.mp=role(u).move;u.hit=false});draw();return}
    const f=foes[i++];if(f.hp<=0)return step();f.mp=role(f).move;
    const goals=[...units.filter(u=>u.hp>0&&u.team==='bee'),...Object.keys(owner).filter(k=>owner[k]!=='foe').map(k=>{const [c,r]=k.split(',').map(Number);return{c,r,pt:1}}),
      ...[0,1,2,3,4,5,6,7].flatMap(c=>[...Array(R).keys()].filter(r=>ter(c,r)==='hive'&&!owner[key(c,r)]).map(r=>({c,r,pt:1})))];
    const hitNow=targets(f);
    if(hitNow.length){hitNow.sort((a,b)=>a.hp-b.hp);sting(f,hitNow[0]);f.hit=true}
    // Move: toward the best goal; prefer high ground; ranged raiders keep distance.
    const rch=reach(f);let best=null,bs=1e9;
    rch.forEach((cost,k)=>{const [a,b]=k.split(',').map(Number);if(unitAt(a,b)&&!(a===f.c&&b===f.r))return;const p={c:a,r:b};
      let s=1e9;goals.forEach(g=>{const d=dist(p,g);s=Math.min(s,g.pt?d*1.2:d*1)});
      if(!f.hit){const [lo,hi]=rangeOf(f,p);const can=units.some(u=>u.hp>0&&u.team==='bee'&&dist(p,u)>=lo&&dist(p,u)<=hi);if(can)s-=6}
      s-=hgt(a,b)*.3;if(s<bs){bs=s;best=[a,b]}});
    if(best){f.c=best[0];f.r=best[1]}
    if(!f.hit){const t2=targets(f);if(t2.length){t2.sort((a,b)=>a.hp-b.hp);sting(f,t2[0])}else log=`${f.name} buzzes forward.`}
    f.hit=true;f.mp=0;draw();if(checkEnd())return;setTimeout(step,480);
  };
  setTimeout(step,350);
}
function finish(win){
  phase='over';draw();
  const n=win?(lost===0&&turn<=10?3:lost<=2?2:1):0;
  $('hd-endT').textContent=win?'🍯 Hive saved!':'💥 The hive fell';
  $('hd-stars').textContent=win?'⭐'.repeat(n)+'☆'.repeat(3-n):'';
  $('hd-endS').textContent=win?`Turn ${turn}. Bees lost: ${lost}. 3 stars = no losses within 10 turns.`:'Tip: put the Sniper on a 3rd-floor hill and hold the hive points.';
  $('hd-end').hidden=false;
}

window.HiveDefense = { setup, get units() { return units; }, enemyTurn, checkEnd, alive, targets, reach, sting, spot, key, dist, baseOf, draw, spawn, get honey() { return honey; } };
document.addEventListener('DOMContentLoaded', async () => {
    await Vault.init();
    const installed = typeof Plugins === 'undefined' || Plugins.isEnabled('hive-defense');
    $('hd-not-installed').hidden = installed;
    $('hd-main').hidden = !installed;
    if (installed) setup();
});
})();

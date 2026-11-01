console.log("/// HIVE MIND HIVE MODULE ONLINE ///");

// The hive's outside view: a mech beehive drawn as one SVG (stacked
// rounded rings like a classic beehive, black honeycomb shell, brass bands,
// curved silver straps, blue / amber / crimson hex cells, a dark hollow
// entrance with a crimson inner rim, landing deck, crimson tip, crown).
// Approved by the user on the hive-exterior concept page (Oct 2026).
//
// HiveMindHive.build(tier) returns the SVG markup plus the points the bee
// engine needs (entrance, deck spots, orbit area). The hive grows with the
// player's level - see HIVE_MIND_HIVE_TIERS and nestTier() in hive-mind.js.
// The bees are drawn and moved by MechBee / MechBeeScene
// (src/core/ui/mech-bee/), inside the two empty layers this SVG provides:
// .ch-fly-back (behind the hive) and .ch-fly-front (in front of it).
// Animation classes (.ch-sway, .ch-cell, .ch-firefly, .ch-glow) live in
// hive-mind.css.

const HIVE_MIND_HIVE_TIERS={
 1:{rings:2},                                   // levels 1-4: small starter hive
 2:{rings:3},                                   // levels 5-9: third ring
 3:{rings:4,cells:true},                        // levels 10-19: glowing hex cells
 4:{rings:4,cells:true,deck:true},              // levels 20-34: landing deck
 5:{rings:5,cells:true,deck:true,crown:true}    // level 35+: five rings + glowing crown
};

function hiveMindHiveHexPts(cx,cy,r,sy=1){const f=v=>(+v).toFixed(1);return Array.from({length:6},(_,i)=>{const a=Math.PI/3*i+Math.PI/6;return f(cx+r*Math.cos(a))+','+f(cy+r*Math.sin(a)*sy)}).join(' ')}

function hiveMindHiveBuild(tier, hid){
 let seed=7;
 const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646};
 const f=v=>(+v).toFixed(1);
 const T=HIVE_MIND_HIVE_TIERS[tier]||HIVE_MIND_HIVE_TIERS[1];
 const W=400,H=500, cx=200;
 const n=T.rings, maxA=66+tier*10, rh=58+tier*2;
 // ring profile: narrow cap, widest a bit below middle, tapering bottom
 const rings=[];
 const top=104;
 for(let i=0;i<n;i++){
  const t=n===1?0.5:i/(n-1);
  const a=maxA*(0.62+0.38*Math.sin(Math.PI*(0.18+0.72*t)));
  rings.push({a, cy: top+rh*0.95+i*rh*0.74, ry: rh*0.66});
 }
 const bottom=rings[n-1].cy+rings[n-1].ry;
 const deckI = T.deck ? Math.min(n-1, Math.floor(n/2)) : -1;
 let s=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="overflow:visible" xmlns="http://www.w3.org/2000/svg" class="hive-mind-hive-svg" role="img" aria-label="Your hive">
 <defs>
  <linearGradient id="${hid}-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="#2a1d4a"/><stop offset=".55" stop-color="#6b3f6e"/><stop offset=".8" stop-color="#c47a5c"/><stop offset="1" stop-color="#3a2340"/></linearGradient>
  <radialGradient id="${hid}-sun" gradientUnits="userSpaceOnUse" cx="88" cy="290" r="225"><stop offset="0" stop-color="#ffd59a" stop-opacity=".9"/><stop offset=".35" stop-color="#ff9e6b" stop-opacity=".35"/><stop offset="1" stop-color="#ff9e6b" stop-opacity="0"/></radialGradient>
  <radialGradient id="${hid}-shell" cx="38%" cy="35%" r="75%"><stop offset="0" stop-color="#3a3f48"/><stop offset=".45" stop-color="#191c21"/><stop offset="1" stop-color="#07080a"/></radialGradient>
  <linearGradient id="${hid}-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".65"/><stop offset=".3" stop-color="#000" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity=".10"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient>
  <linearGradient id="${hid}-brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e4806"/><stop offset=".3" stop-color="#e8c25a"/><stop offset=".5" stop-color="#fff0b0"/><stop offset=".7" stop-color="#c8951c"/><stop offset="1" stop-color="#5a3a04"/></linearGradient>
  <linearGradient id="${hid}-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5d646c"/><stop offset=".45" stop-color="#e3e8ee"/><stop offset="1" stop-color="#6a727b"/></linearGradient>
  <linearGradient id="${hid}-deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dee4"/><stop offset=".6" stop-color="#8d959e"/><stop offset="1" stop-color="#4c5259"/></linearGradient>
  <radialGradient id="${hid}-glass" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#d9fbff"/><stop offset=".35" stop-color="#5fe3ff"/><stop offset=".8" stop-color="#0d6f8f"/><stop offset="1" stop-color="#053243"/></radialGradient>
  <radialGradient id="${hid}-hole" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#000"/><stop offset=".7" stop-color="#050403"/><stop offset="1" stop-color="#1c1408"/></radialGradient>
  <radialGradient id="${hid}-aura" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd76a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>
  <pattern id="${hid}-honey" width="14" height="24.25" patternUnits="userSpaceOnUse"><path d="M7 0l7 4v8l-7 4-7-4V4zM0 16.2l7 4V28M14 16.2l-7 4" fill="none" stroke="#2c323a" stroke-width="1.3"/></pattern>
  <filter id="${hid}-blur3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="${hid}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
 </defs>
 <rect class="ch-sky" x="-1500" y="-1000" width="3400" height="2600" fill="url(#${hid}-sky)"/><rect class="ch-sky" x="-1500" y="-1000" width="3400" height="2600" fill="url(#${hid}-sun)"/>`;
 // Scenery beyond the 400x500 frame, so the art can fill any screen shape
 // (the SVG uses "meet" + overflow visible). Separate random stream so the
 // hive itself looks exactly the same as the approved concept.
 let seed2=99;const rnd2=()=>{seed2=(seed2*16807)%2147483647;return (seed2-1)/2147483646};
 let wide='';
 for(let i=0;i<60;i++){const side=rnd2()<.5?-1:1;const x=side<0?-900+rnd2()*900:400+rnd2()*900,y=120+rnd2()*560,r=3+rnd2()*10;wide+=`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${rnd2()<.7?'#7fa2ff':'#c4b5ff'}" opacity="${f(.12+rnd2()*.3)}"/>`}
 s+=`<g filter="url(#${hid}-blur3)"><path d="M-260 700 C-250 520 -280 430 -330 380 L-300 370 C-240 420 -220 520 -220 700Z" fill="#1d1430" opacity=".8"/><path d="M620 700 C630 520 600 420 560 380 L590 370 C640 430 660 520 660 700Z" fill="#1d1430" opacity=".8"/>${wide}</g>`;
 for(let i=0;i<24;i++){const side=rnd2()<.5?-1:1;s+=`<circle class="ch-firefly" cx="${f(side<0?-700+rnd2()*700:400+rnd2()*700)}" cy="${f(100+rnd2()*560)}" r="${f(1+rnd2()*1.4)}" fill="#fff4c4" style="--d:${f(3+rnd2()*4)}s;--dl:${f(-rnd2()*6)}s;--fx:${f(rnd2()*30-15)}px;--fy:${f(-rnd2()*25)}px"/>`}
 // distant blurred blossoms + trees
 let blos='';for(let i=0;i<34;i++){const x=rnd()*W,y=180+rnd()*320,r=3+rnd()*9;blos+=`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${rnd()<.7?'#7fa2ff':'#c4b5ff'}" opacity="${f(.15+rnd()*.35)}"/>`}
 s+=`<g filter="url(#${hid}-blur3)"><path d="M300 500 C300 380 330 330 360 300 L380 300 C350 340 335 400 340 500Z" fill="#1d1430" opacity=".8"/><path d="M40 500 C50 420 30 360 10 330 L0 330 L0 500Z" fill="#1d1430" opacity=".8"/>${blos}</g>`;
 // fireflies
 for(let i=0;i<16;i++){s+=`<circle class="ch-firefly" cx="${f(rnd()*W)}" cy="${f(120+rnd()*360)}" r="${f(1+rnd()*1.4)}" fill="#fff4c4" style="--d:${f(3+rnd()*4)}s;--dl:${f(-rnd()*6)}s;--fx:${f(rnd()*30-15)}px;--fy:${f(-rnd()*25)}px"/>`}
 // branch with blossoms
 s+=`<path d="M-1500 96 C-900 70 -400 78 -2 52 L-2 74 C-400 98 -900 94 -1500 120Z" fill="#2a1c22" stroke="#130c10" stroke-width="2"/>
 <path d="M402 34 C700 22 1100 40 1900 16 L1900 38 C1100 62 700 50 402 52Z" fill="#2a1c22" stroke="#130c10" stroke-width="2"/>
 <path d="M-260 82 C-240 56 -220 44 -196 34" stroke="#2a1c22" stroke-width="6" fill="none" stroke-linecap="round"/>
 <path d="M640 34 C660 56 690 66 720 66" stroke="#2a1c22" stroke-width="5" fill="none" stroke-linecap="round"/>`;
 [[-560,82],[-420,74],[-300,70],[-196,32],[-120,62],[480,40],[560,30],[720,66],[820,36],[960,30]].forEach(([x,y])=>{
  let p='';for(let k=0;k<5;k++){const a=k*72*Math.PI/180;p+=`<ellipse cx="${f(x+Math.cos(a)*5)}" cy="${f(y+Math.sin(a)*5)}" rx="4.2" ry="3" transform="rotate(${k*72} ${f(x+Math.cos(a)*5)} ${f(y+Math.sin(a)*5)})" fill="#8fb0ff"/>`}
  s+=`<g opacity=".95">${p}<circle cx="${x}" cy="${y}" r="2" fill="#ffe9a8"/></g>`});
 s+=`<path d="M-10 52 C80 30 150 44 210 36 S330 20 410 34 L410 52 C330 40 280 52 210 56 S90 56 -10 74Z" fill="#2a1c22" stroke="#130c10" stroke-width="2"/>
 <path d="M120 42 C135 18 150 10 168 4" stroke="#2a1c22" stroke-width="6" fill="none" stroke-linecap="round"/>
 <path d="M300 30 C315 50 335 60 360 62" stroke="#2a1c22" stroke-width="5" fill="none" stroke-linecap="round"/>`;
 [[30,58],[95,40],[160,8],[250,30],[330,26],[362,62],[390,40],[60,48]].forEach(([x,y])=>{
  let p='';for(let k=0;k<5;k++){const a=k*72*Math.PI/180;p+=`<ellipse cx="${f(x+Math.cos(a)*5)}" cy="${f(y+Math.sin(a)*5)}" rx="4.2" ry="3" transform="rotate(${k*72} ${f(x+Math.cos(a)*5)} ${f(y+Math.sin(a)*5)})" fill="#8fb0ff"/>`}
  s+=`<g opacity=".95">${p}<circle cx="${x}" cy="${y}" r="2" fill="#ffe9a8"/></g>`});

 // bees on the far side of their loop fly behind the hive
 s+=`<g class="ch-fly-back"></g>`;
 // ---- the hive (sways from the ring) ----
 s+=`<g class="ch-sway">`;
 if(T.crown) s+=`<ellipse cx="${cx}" cy="${f((top+bottom)/2)}" rx="${f(maxA*1.9)}" ry="${f((bottom-top)*0.85)}" fill="url(#${hid}-aura)"/>`;
 // hanger: ring + chain + cap
 s+=`<circle cx="${cx}" cy="50" r="13" fill="none" stroke="url(#${hid}-brass)" stroke-width="5"/>
  <path d="M${cx} 63 V${top+6}" stroke="#2a2d31" stroke-width="5"/><path d="M${cx-1} 63 V${top+6}" stroke="#c9ced4" stroke-width="1.6"/>
  ${Array.from({length:Math.floor((top-60)/9)},(_,k)=>`<ellipse cx="${cx}" cy="${66+k*9}" rx="3.2" ry="4.6" fill="none" stroke="#9aa1a8" stroke-width="1.6"/>`).join('')}`;
 // rounded dome cap on top (skep crown)
 const r0=rings[0], domeA=r0.a*0.62, domeY=r0.cy-r0.ry*0.55;
 s+=`<ellipse cx="${cx}" cy="${f(domeY)}" rx="${f(domeA)}" ry="${f(r0.ry*0.95)}" fill="url(#${hid}-shell)" stroke="#050506" stroke-width="2"/>
  <clipPath id="${hid}-dome"><ellipse cx="${cx}" cy="${f(domeY)}" rx="${f(domeA)}" ry="${f(r0.ry*0.95)}"/></clipPath>
  <g clip-path="url(#${hid}-dome)"><rect x="${f(cx-domeA)}" y="${f(domeY-r0.ry)}" width="${f(domeA*2)}" height="${f(r0.ry*2)}" fill="url(#${hid}-honey)" opacity=".9"/><rect x="${f(cx-domeA)}" y="${f(domeY-r0.ry)}" width="${f(domeA*2)}" height="${f(r0.ry*2)}" fill="url(#${hid}-shade)"/></g>
  <path d="M${cx-16} ${f(domeY-r0.ry*0.95+4)} Q${cx} ${f(domeY-r0.ry*0.95-14)} ${cx+16} ${f(domeY-r0.ry*0.95+4)}Z" fill="url(#${hid}-brass)" stroke="#3a2604" stroke-width="1.2"/>`;
 // deck back half
 let deckSpots=[];
 const deckRing = deckI>=0? rings[deckI]:null;
 const deckY = deckRing? deckRing.cy+deckRing.ry*0.72 : 0, deckA = maxA*1.32, deckRy=deckA*0.17;
 if(deckRing) s+=`<ellipse cx="${cx}" cy="${f(deckY+6)}" rx="${f(deckA)}" ry="${f(deckRy)}" fill="#3a3f45"/><ellipse cx="${cx}" cy="${f(deckY)}" rx="${f(deckA)}" ry="${f(deckRy)}" fill="url(#${hid}-deck)" stroke="#2b2f34" stroke-width="1.5"/>`;
 // rings top -> bottom (lower rings overlap upper ones)
 let zx=cx, zy=rings[0].cy, port='';
 rings.forEach((r,i)=>{
  const id='rc'+i;
  s+=`<clipPath id="${hid}-${id}"><ellipse cx="${cx}" cy="${f(r.cy)}" rx="${f(r.a)}" ry="${f(r.ry)}"/></clipPath>
  <ellipse cx="${cx}" cy="${f(r.cy+3)}" rx="${f(r.a+2)}" ry="${f(r.ry+2)}" fill="#000" opacity=".5"/>
  <ellipse cx="${cx}" cy="${f(r.cy)}" rx="${f(r.a)}" ry="${f(r.ry)}" fill="url(#${hid}-shell)" stroke="#050506" stroke-width="2"/>
  <g clip-path="url(#${hid}-${id})"><rect x="${f(cx-r.a)}" y="${f(r.cy-r.ry)}" width="${f(r.a*2)}" height="${f(r.ry*2)}" fill="url(#${hid}-honey)" opacity=".9"/>`;
  // glowing hex cells
  // glowing hex cells: blue + amber + crimson (crimson shows on every tier as the accent)
  const CELL={blue:['rgba(80,220,255,.28)','#6ff0ff'],amber:['rgba(255,170,60,.35)','#ffb347'],crimson:['rgba(214,30,40,.38)','#ff3b3b']};
  const k=T.cells?3+Math.round(r.a/30):1+(i%2);
  for(let j=0;j<k;j++){const u=(rnd()*1.5-.75),v=(rnd()*1.1-.55);const x=cx+u*r.a,y=r.cy+v*r.ry;const rr=6+rnd()*4;
   const roll=rnd();const kind=!T.cells?'crimson':(roll<.3?'crimson':roll<.5?'amber':'blue');
   s+=`<polygon class="ch-cell" points="${hiveMindHiveHexPts(x,y,rr)}" fill="${CELL[kind][0]}" stroke="${CELL[kind][1]}" stroke-width="1.8" filter="url(#${hid}-glow)" style="--d:${f(2+rnd()*3)}s;--dl:${f(-rnd()*4)}s"/>`}
  // straps
  [-0.62,-0.5,0.5,0.62].forEach(k=>{
   // a "meridian" line on the ring: x shrinks toward the centre near the top and bottom edges
   let d='';for(let q=0;q<=24;q++){const v=-0.98+q*(1.96/24);const x=cx+k*r.a*Math.sqrt(1-v*v);const y=r.cy+v*r.ry;d+=(q?'L':'M')+f(x)+' '+f(y);}
   s+=`<path d="${d}" stroke="#2a2d31" stroke-width="5.5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#c9ced4" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#fff" stroke-opacity=".45" stroke-width="1" fill="none" transform="translate(${k<0?-0.8:0.8} 0)"/>`});
  s+=`<rect x="${f(cx-r.a)}" y="${f(r.cy-r.ry)}" width="${f(r.a*2)}" height="${f(r.ry*2)}" fill="url(#${hid}-shade)"/></g>`;
  // brass band along the lower front edge + rivets
  const by=r.cy+r.ry*0.18, ba=r.a*0.985, bry=r.ry*0.78;
  s+=`<path d="M${f(cx-ba)} ${f(by)} A${f(ba)} ${f(bry)} 0 0 0 ${f(cx+ba)} ${f(by)}" fill="none" stroke="#3a2604" stroke-width="7"/><path d="M${f(cx-ba)} ${f(by)} A${f(ba)} ${f(bry)} 0 0 0 ${f(cx+ba)} ${f(by)}" fill="none" stroke="url(#${hid}-brass)" stroke-width="4.5"/>`;
  for(let t=0.12;t<0.9;t+=0.11){const ang=Math.PI*t;const x=cx-ba*Math.cos(ang),y=by+bry*Math.sin(ang);s+=`<circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="#fff3b8" stroke="#5a3a04" stroke-width=".6"/>`}
 });
 // hollow entrance - low on the deck ring (or the bottom ring), dark like a real way in
 const er = deckRing || rings[n-1];
 const ex=cx, ey=er.cy+er.ry*(deckRing?0.36:0.42), erx=Math.min(26, er.a*0.3), ery=9.5;
 zx=ex; zy=ey;
 s+=`<ellipse cx="${f(ex)}" cy="${f(ey+1.5)}" rx="${f(erx+6)}" ry="${f(ery+5)}" fill="#2a1c06"/>
  <ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(erx+5)}" ry="${f(ery+4)}" fill="none" stroke="url(#${hid}-brass)" stroke-width="3.2"/>
  <ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(erx)}" ry="${f(ery)}" fill="url(#${hid}-hole)"/>
  <ellipse class="ch-cell" cx="${f(ex)}" cy="${f(ey)}" rx="${f(erx+1.4)}" ry="${f(ery+1.2)}" fill="none" stroke="#ff3b3b" stroke-width="1.6" filter="url(#${hid}-glow)" style="--d:3.4s;--dl:-1s"/>
  <ellipse class="ch-glow" cx="${f(ex)}" cy="${f(ey+ery*0.35)}" rx="${f(erx*0.45)}" ry="${f(ery*0.32)}" fill="#ff9a30" opacity=".18" filter="url(#${hid}-blur3)"/>
  <path d="M${f(ex-erx)} ${f(ey)} A${f(erx)} ${f(ery)} 0 0 1 ${f(ex+erx)} ${f(ey)}" fill="none" stroke="#000" stroke-opacity=".8" stroke-width="3"/>`;
  for(let k=0;k<10;k++){const ang=Math.PI*2*k/10;s+=`<circle cx="${f(ex+Math.cos(ang)*(erx+5))}" cy="${f(ey+Math.sin(ang)*(ery+4))}" r="1.3" fill="#fff3b8" stroke="#5a3a04" stroke-width=".5"/>`}
 // deck front half with hex holes + landing bees
 if(deckRing){
  const frontClip=`<clipPath id="${hid}-df"><path d="M${f(cx-deckA-2)} ${f(deckY)} A${f(deckA+2)} ${f(deckRy+2)} 0 0 0 ${f(cx+deckA+2)} ${f(deckY)} L${f(cx+deckA+2)} ${f(deckY+20)} L${f(cx-deckA-2)} ${f(deckY+20)}Z"/></clipPath>`;
  let holes='';for(let row=0;row<3;row++){const rr=deckA*(0.95-row*0.18);const cnt=14-row*3;for(let k=0;k<cnt;k++){const ang=Math.PI*(k+.5)/cnt;const x=cx-rr*Math.cos(ang);const y=deckY+deckRy*(rr/deckA)*Math.sin(ang)*0.95;holes+=`<polygon points="${hiveMindHiveHexPts(x,y,4.2,.42)}" fill="#22262b" stroke="#f0f3f6" stroke-opacity=".5" stroke-width=".6"/>`}}
  s+=frontClip+`<g clip-path="url(#${hid}-df)"><path d="M${f(cx-deckA)} ${f(deckY)} A${f(deckA)} ${f(deckRy)} 0 0 0 ${f(cx+deckA)} ${f(deckY)} L${f(cx+deckA)} ${f(deckY+6)} A${f(deckA)} ${f(deckRy)} 0 0 1 ${f(cx-deckA)} ${f(deckY+6)}Z" fill="#41464c"/>
   <path d="M${f(cx-deckA)} ${f(deckY)} A${f(deckA)} ${f(deckRy)} 0 0 0 ${f(cx+deckA)} ${f(deckY)} Q${f(cx)} ${f(deckY-deckRy*0.15)} ${f(cx-deckA)} ${f(deckY)}Z" fill="url(#${hid}-deck)"/>${holes}</g>
   <path d="M${f(cx-deckA)} ${f(deckY)} A${f(deckA)} ${f(deckRy)} 0 0 0 ${f(cx+deckA)} ${f(deckY)}" fill="none" stroke="url(#${hid}-steel)" stroke-width="2.5"/>
   <path d="M${f(cx-deckA)} ${f(deckY+6)} A${f(deckA)} ${f(deckRy)} 0 0 0 ${f(cx+deckA)} ${f(deckY+6)}" fill="none" stroke="#2b2f34" stroke-width="2"/>`;
  deckSpots=[-0.62,0.55,-0.25].map(q=>({x:cx+q*deckA, y:deckY+deckRy*0.62-2}));
 }
 // bottom finial
 s+=`<circle class="ch-glow" cx="${cx}" cy="${f(bottom+19)}" r="13" fill="#d42a1e" opacity=".55" filter="url(#${hid}-blur3)"/>`;
 s+=`<path d="M${cx-14} ${f(bottom-4)} L${cx+14} ${f(bottom-4)} L${cx+6} ${f(bottom+14)} L${cx-6} ${f(bottom+14)}Z" fill="url(#${hid}-brass)" stroke="#3a2604" stroke-width="1.2"/><circle cx="${cx}" cy="${f(bottom+19)}" r="5" fill="url(#${hid}-brass)" stroke="#3a2604"/><circle cx="${cx}" cy="${f(bottom+19)}" r="2.6" fill="#ff3b3b" filter="url(#${hid}-glow)"/>`;
 if(T.crown) for(let k=-2;k<=2;k++){s+=`<circle class="ch-cell" cx="${cx+k*11}" cy="${f(rings[0].cy-rings[0].ry*0.9)}" r="2.4" fill="${k%2?'#ff3b3b':'#6ff0ff'}" filter="url(#${hid}-glow)" style="--d:2.2s;--dl:${k*.3}s"/>`}
 s+=`</g>`;
 s+=`<g class="ch-fly-front"></g>`;
 s+=`</svg>`;
 return {svg:s, cx, top, bottom, maxA, entrance:{x:ex, y:ey}, deckSpots, viewBox:{w:W,h:H}};
}


let hiveMindHiveUid = 0;
const HiveMindHive = {
    TIERS: HIVE_MIND_HIVE_TIERS,
    build(tier) {
        return hiveMindHiveBuild(Math.max(1, Math.min(5, tier || 1)), `hive${hiveMindHiveUid++}`);
    }
};

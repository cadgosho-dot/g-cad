window.addEventListener('jcad-auth-ready', () => {
'use strict';

const RING_TABLE = [
  [1,13.0],[2,13.4],[3,13.7],[4,14.0],[5,14.4],[6,14.7],[7,15.0],[8,15.4],[9,15.7],[10,16.0],
  [11,16.4],[12,16.7],[13,17.0],[14,17.4],[15,17.7],[16,18.0],[17,18.4],[18,18.7],[19,19.0],[20,19.4],
  [21,19.7],[22,20.0],[23,20.4],[24,20.7],[25,21.0],[26,21.4],[27,21.7],[28,22.0],[29,22.4],[30,22.7]
];

const DEFAULTS = {
  ringSize: 12,
  shankWidth: 2.4,
  shankThickness: 1.8,
  stoneDiameter: 6.5,
  stoneDepth: 4.0,
  seatClearance: 0.25,
  prongCount: 4,
  prongDiameter: 0.85,
  prongHeight: 4.5,
  showStone: true,
  showGrid: true,
  wireframe: false
};

let params = structuredClone(DEFAULTS);
let undoStack = [];
let redoStack = [];
let historyEntries = ['新規ソリテールリングを作成'];
let meshData = { metal: [], stone: [] };
let camera = { yaw: -0.72, pitch: -0.25, zoom: 25, target:[0,0,4], perspective: true };
let dragging = false, lastX=0, lastY=0;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function v3(x=0,y=0,z=0){ return [x,y,z]; }
function add(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function mul(a,s){return [a[0]*s,a[1]*s,a[2]*s]}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function len(a){return Math.hypot(a[0],a[1],a[2])}
function norm(a){const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l]}
function rotateX(p,a){const c=Math.cos(a),s=Math.sin(a);return [p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c]}
function rotateY(p,a){const c=Math.cos(a),s=Math.sin(a);return [p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c]}
function rotateZ(p,a){const c=Math.cos(a),s=Math.sin(a);return [p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]]}

function ringDiameterForSize(size){
  const lo=Math.floor(size), hi=Math.ceil(size);
  const dlo=(RING_TABLE.find(x=>x[0]===lo)||RING_TABLE[0])[1];
  const dhi=(RING_TABLE.find(x=>x[0]===hi)||RING_TABLE[RING_TABLE.length-1])[1];
  if(lo===hi) return dlo;
  return dlo + (dhi-dlo)*(size-lo)/(hi-lo);
}

function mesh(name, material='metal'){ return {name, material, vertices:[], faces:[]}; }
function tri(m,a,b,c){m.faces.push([a,b,c]);}

function makeTorusElliptical(R, radial, width, segU=96, segV=20, zOffset=0){
  const m=mesh('Ring Shank');
  for(let i=0;i<segU;i++){
    const u=i/segU*Math.PI*2;
    for(let j=0;j<segV;j++){
      const v=j/segV*Math.PI*2;
      const rr=R + radial*Math.cos(v);
      const x=rr*Math.cos(u);
      const z=rr*Math.sin(u)+zOffset;
      const y=(width/2)*Math.sin(v);
      m.vertices.push([x,y,z]);
    }
  }
  for(let i=0;i<segU;i++) for(let j=0;j<segV;j++){
    const a=i*segV+j, b=((i+1)%segU)*segV+j, c=((i+1)%segU)*segV+(j+1)%segV, d=i*segV+(j+1)%segV;
    tri(m,a,b,d); tri(m,b,c,d);
  }
  return m;
}

function makeCylinder(radius,height,segments=20,center=[0,0,0], axis='z'){
  const m=mesh('Cylinder');
  const half=height/2;
  for(let k=0;k<2;k++){
    const z=k?half:-half;
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2;
      let p=[radius*Math.cos(a),radius*Math.sin(a),z];
      if(axis==='x') p=[z,p[0],p[1]];
      else if(axis==='y') p=[p[0],z,p[1]];
      m.vertices.push(add(p,center));
    }
  }
  const c0=m.vertices.length; m.vertices.push(add(axis==='z'?[0,0,-half]:axis==='x'?[-half,0,0]:[0,-half,0],center));
  const c1=m.vertices.length; m.vertices.push(add(axis==='z'?[0,0,half]:axis==='x'?[half,0,0]:[0,half,0],center));
  for(let i=0;i<segments;i++){
    const n=(i+1)%segments, a=i,b=n,c=segments+n,d=segments+i;
    tri(m,a,b,d);tri(m,b,c,d);tri(m,c0,b,a);tri(m,c1,d,c);
  }
  return m;
}

function makeHorizontalTorus(R,tube, z, segU=56, segV=12){
  const m=mesh('Seat');
  for(let i=0;i<segU;i++){
    const u=i/segU*Math.PI*2;
    for(let j=0;j<segV;j++){
      const v=j/segV*Math.PI*2;
      const rr=R+tube*Math.cos(v);
      m.vertices.push([rr*Math.cos(u),rr*Math.sin(u),z+tube*Math.sin(v)]);
    }
  }
  for(let i=0;i<segU;i++) for(let j=0;j<segV;j++){
    const a=i*segV+j,b=((i+1)%segU)*segV+j,c=((i+1)%segU)*segV+(j+1)%segV,d=i*segV+(j+1)%segV;
    tri(m,a,b,d);tri(m,b,c,d);
  }
  return m;
}

function makeStone(diameter,depth,zCenter){
  const m=mesh('Round Brilliant','stone');
  const R=diameter/2;
  const rings=[
    {r:0,z:-depth*0.48},
    {r:R,z:-depth*0.05},
    {r:R,z:0},
    {r:R*0.56,z:depth*0.33},
    {r:R*0.52,z:depth*0.48}
  ];
  const seg=32;
  for(const ring of rings){
    if(ring.r===0){ m.vertices.push([0,0,zCenter+ring.z]); continue; }
    for(let i=0;i<seg;i++){
      const a=i/seg*Math.PI*2;
      m.vertices.push([ring.r*Math.cos(a),ring.r*Math.sin(a),zCenter+ring.z]);
    }
  }
  const tip=0, baseStart=1, girdleStart=1+seg, crownStart=1+seg*2, tableStart=1+seg*3;
  for(let i=0;i<seg;i++){
    const n=(i+1)%seg;
    tri(m,tip,baseStart+n,baseStart+i);
    tri(m,baseStart+i,baseStart+n,girdleStart+i); tri(m,baseStart+n,girdleStart+n,girdleStart+i);
    tri(m,girdleStart+i,girdleStart+n,crownStart+i); tri(m,girdleStart+n,crownStart+n,crownStart+i);
    tri(m,crownStart+i,crownStart+n,tableStart+i); tri(m,crownStart+n,tableStart+n,tableStart+i);
  }
  const centerTop=m.vertices.length; m.vertices.push([0,0,zCenter+depth*0.48]);
  for(let i=0;i<seg;i++){const n=(i+1)%seg;tri(m,centerTop,tableStart+i,tableStart+n);}
  return m;
}

function mergeMeshes(meshes,name='Merged'){
  const out=mesh(name);
  let offset=0;
  for(const m of meshes){
    out.vertices.push(...m.vertices);
    for(const f of m.faces) out.faces.push([f[0]+offset,f[1]+offset,f[2]+offset]);
    offset+=m.vertices.length;
  }
  return out;
}

function buildModel(){
  const innerD=ringDiameterForSize(params.ringSize);
  const innerR=innerD/2;
  const radial=params.shankThickness/2;
  const R=innerR+radial;
  const ring=makeTorusElliptical(R,radial,params.shankWidth,96,20,0);
  ring.name='リング腕';

  const outerTop=R+radial;
  const seatZ=outerTop + params.stoneDepth*0.12;
  const seatRadius=params.stoneDiameter/2 + params.seatClearance;
  const seatTube=Math.max(0.35,params.prongDiameter*0.42);
  const seat=makeHorizontalTorus(seatRadius,seatTube,seatZ-params.stoneDepth*0.18,64,12);
  seat.name='石座';

  const stoneZ=seatZ+params.stoneDepth*0.25;
  const stone=makeStone(params.stoneDiameter,params.stoneDepth,stoneZ);

  const prongs=[];
  const prongR=params.prongDiameter/2;
  const prongDist=params.stoneDiameter/2 + prongR*0.55;
  const prongZ=seatZ + params.prongHeight/2 - params.stoneDepth*0.22;
  for(let i=0;i<params.prongCount;i++){
    const a=Math.PI/4 + i/params.prongCount*Math.PI*2;
    const c=[Math.cos(a)*prongDist,Math.sin(a)*prongDist,prongZ];
    const p=makeCylinder(prongR,params.prongHeight,16,c,'z');
    p.name='爪'+(i+1);prongs.push(p);
  }

  meshData={metal:[ring,seat,...prongs],stone:[stone]};
  document.getElementById('treeProngs').textContent=params.prongCount+' pcs';
  updateChecks();
  updateInfo();
  render();
}

function viewTransform(p){
  let q=sub(p,camera.target);
  q=[q[0],q[2],q[1]];
  q=rotateY(q,camera.yaw);
  q=rotateX(q,camera.pitch);
  return q;
}

function project(p,w,h){
  const q=viewTransform(p);
  const scale=Math.min(w,h)/camera.zoom;
  if(camera.perspective){
    const depth=48-q[2];
    const f=48/Math.max(8,depth);
    return [w/2+q[0]*scale*f,h/2-q[1]*scale*f,q[2],f];
  }
  return [w/2+q[0]*scale,h/2-q[1]*scale,q[2],1];
}

function drawGrid(w,h){
  if(!params.showGrid) return;
  const span=20, step=2;
  ctx.lineWidth=1;
  for(let i=-span;i<=span;i+=step){
    const a=project([i,-span,0],w,h),b=project([i,span,0],w,h);
    ctx.strokeStyle=i===0?'#4d5968':'#252b33';ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
    const c=project([-span,i,0],w,h),d=project([span,i,0],w,h);
    ctx.strokeStyle=i===0?'#4d5968':'#252b33';ctx.beginPath();ctx.moveTo(c[0],c[1]);ctx.lineTo(d[0],d[1]);ctx.stroke();
  }
}

function faceColor(normal,material){
  const light=norm([0.4,-0.35,1]);
  const lum=clamp(0.25+0.75*Math.max(0,dot(normal,light)),0.18,1);
  if(material==='stone') return `rgba(${Math.round(70*lum)},${Math.round(190*lum+30)},${Math.round(255*lum)},0.58)`;
  const r=Math.round(210*lum),g=Math.round(178*lum),b=Math.round(82*lum);
  return `rgb(${r},${g},${b})`;
}

function renderMesh(m,w,h,triangles){
  const pv=m.vertices.map(v=>project(v,w,h));
  for(const f of m.faces){
    const a3=viewTransform(m.vertices[f[0]]),b3=viewTransform(m.vertices[f[1]]),c3=viewTransform(m.vertices[f[2]]);
    const n=norm(cross(sub(b3,a3),sub(c3,a3)));
    const pa=pv[f[0]],pb=pv[f[1]],pc=pv[f[2]];
    const screenCross=(pb[0]-pa[0])*(pc[1]-pa[1])-(pb[1]-pa[1])*(pc[0]-pa[0]);
    if(!params.wireframe && screenCross>0) continue;
    triangles.push({pa,pb,pc,z:(pa[2]+pb[2]+pc[2])/3,n,material:m.material||'metal'});
  }
}

function render(){
  const rect=canvas.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const W=Math.max(1,Math.round(rect.width*dpr)),H=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const w=rect.width,h=rect.height;
  ctx.clearRect(0,0,w,h);
  drawGrid(w,h);
  const triangles=[];
  for(const m of meshData.metal) renderMesh(m,w,h,triangles);
  if(params.showStone) for(const m of meshData.stone) renderMesh(m,w,h,triangles);
  triangles.sort((a,b)=>a.z-b.z);
  ctx.lineJoin='round';
  for(const t of triangles){
    ctx.beginPath();ctx.moveTo(t.pa[0],t.pa[1]);ctx.lineTo(t.pb[0],t.pb[1]);ctx.lineTo(t.pc[0],t.pc[1]);ctx.closePath();
    if(params.wireframe){ctx.strokeStyle=t.material==='stone'?'#68c9ff':'#d1ad4a';ctx.lineWidth=.7;ctx.stroke();}
    else {ctx.fillStyle=faceColor(t.n,t.material);ctx.fill();ctx.strokeStyle=t.material==='stone'?'rgba(120,210,255,.24)':'rgba(255,235,160,.12)';ctx.lineWidth=.35;ctx.stroke();}
  }
  drawAxis(w,h);
}

function drawAxis(w,h){
  const o=[64,h-55],L=28;
  const axes=[[[L,0,0],'X','#d06c6c'],[[0,L,0],'Y','#6fcf89'],[[0,0,L],'Z','#6c9de8']];
  const base=viewTransform([0,0,0]);
  for(const [v,label,color] of axes){
    const p=viewTransform(v), d=norm([p[0]-base[0],p[1]-base[1],0]);
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(o[0],o[1]);ctx.lineTo(o[0]+d[0]*L,o[1]-d[1]*L);ctx.stroke();ctx.fillText(label,o[0]+d[0]*(L+9)-4,o[1]-d[1]*(L+9)+4);
  }
}

function getBounds(meshes){
  let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const m of meshes) for(const v of m.vertices) for(let i=0;i<3;i++){min[i]=Math.min(min[i],v[i]);max[i]=Math.max(max[i],v[i]);}
  return {min,max,size:[max[0]-min[0],max[1]-min[1],max[2]-min[2]],center:[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2]};
}

function fitView(){
  const all=[...meshData.metal,...meshData.stone]; if(!all.length)return;
  const b=getBounds(all);camera.target=b.center;camera.zoom=Math.max(...b.size)*1.35+4;render();
}

function setView(v){
  camera.perspective=v==='iso';
  if(v==='front'){camera.yaw=0;camera.pitch=0;}
  if(v==='right'){camera.yaw=-Math.PI/2;camera.pitch=0;}
  if(v==='top'){camera.yaw=0;camera.pitch=-Math.PI/2;}
  if(v==='iso'){camera.yaw=-0.72;camera.pitch=-0.35;}
  fitView();
}

function updateInfo(){
  const inner=ringDiameterForSize(params.ringSize);
  const b=getBounds(meshData.metal);
  const tris=meshData.metal.reduce((s,m)=>s+m.faces.length,0);
  document.getElementById('viewInfo').innerHTML=`JCS ${params.ringSize}号<br>内径 ${inner.toFixed(2)} mm<br>中石 φ${params.stoneDiameter.toFixed(2)} mm`;
  document.getElementById('triText').textContent=`金属メッシュ: ${tris.toLocaleString()} triangles`;
  document.getElementById('sizeText').textContent=`外形: ${b.size[0].toFixed(1)} × ${b.size[1].toFixed(1)} × ${b.size[2].toFixed(1)} mm`;
}

function updateChecks(){
  const issues=[];
  if(params.shankThickness<1.2) issues.push('リング腕厚が1.2 mm未満です');
  if(params.shankWidth<1.2) issues.push('リング腕幅が1.2 mm未満です');
  if(params.prongDiameter<0.65) issues.push('爪径が0.65 mm未満です');
  if(params.prongHeight<params.stoneDepth*0.55) issues.push('爪高さが石深さに対して低めです');
  const html=issues.length
    ? `<div class="warn">注意 ${issues.length}件</div>`+issues.map(x=>`<div>・${x}</div>`).join('')
    : `<div class="ok">基本寸法チェック: OK</div><div>閉じた三角形メッシュとしてSTL出力できます。</div>`;
  document.getElementById('checkSummary').innerHTML=html;
}

function snapshot(){return JSON.stringify(params)}
function commitChange(label,oldSnap){
  const now=snapshot(); if(now===oldSnap)return;
  undoStack.push(oldSnap); if(undoStack.length>80)undoStack.shift(); redoStack=[];
  historyEntries.unshift(label); if(historyEntries.length>40)historyEntries.pop();
  renderHistory(); updateButtons();
}
function renderHistory(){
  const h=document.getElementById('history');h.innerHTML='';
  historyEntries.forEach((x,i)=>{const d=document.createElement('div');d.textContent=(i===0?'● ':'')+x;h.appendChild(d);});
}
function updateButtons(){document.getElementById('undoBtn').disabled=!undoStack.length;document.getElementById('redoBtn').disabled=!redoStack.length;}

function syncUI(){
  document.getElementById('ringSize').value=String(params.ringSize);
  document.getElementById('innerDiameter').value=ringDiameterForSize(params.ringSize).toFixed(2);
  ['shankWidth','shankThickness','stoneDiameter','stoneDepth','seatClearance','prongDiameter','prongHeight'].forEach(id=>document.getElementById(id).value=params[id]);
  document.getElementById('prongCount').value=String(params.prongCount);
  document.getElementById('showStone').checked=params.showStone;
  document.getElementById('showGrid').checked=params.showGrid;
  document.getElementById('wireframe').checked=params.wireframe;
}

function applyParams(newParams){ params={...structuredClone(DEFAULTS),...newParams}; syncUI(); buildModel(); }

function bindInputs(){
  const map=[
    ['ringSize','ringSize',Number,'リングサイズを変更'],['shankWidth','shankWidth',Number,'リング腕幅を変更'],['shankThickness','shankThickness',Number,'リング腕厚を変更'],
    ['stoneDiameter','stoneDiameter',Number,'中石直径を変更'],['stoneDepth','stoneDepth',Number,'中石深さを変更'],['seatClearance','seatClearance',Number,'石座クリアランスを変更'],
    ['prongCount','prongCount',Number,'爪本数を変更'],['prongDiameter','prongDiameter',Number,'爪径を変更'],['prongHeight','prongHeight',Number,'爪高さを変更']
  ];
  for(const [id,key,conv,label] of map){
    const el=document.getElementById(id); let oldSnap=snapshot();
    el.addEventListener('focus',()=>oldSnap=snapshot());
    el.addEventListener('change',()=>{params[key]=conv(el.value);syncUI();buildModel();commitChange(label,oldSnap);oldSnap=snapshot();});
  }
  for(const id of ['showStone','showGrid','wireframe']){
    document.getElementById(id).addEventListener('change',e=>{params[id]=e.target.checked;render();});
  }
}

function exportSTL(){
  const merged=mergeMeshes(meshData.metal,'g-CAD Metal');
  let s='solid g_CAD_Metal\n';
  for(const f of merged.faces){
    const a=merged.vertices[f[0]],b=merged.vertices[f[1]],c=merged.vertices[f[2]];
    const n=norm(cross(sub(b,a),sub(c,a)));
    s+=` facet normal ${n[0].toExponential(7)} ${n[1].toExponential(7)} ${n[2].toExponential(7)}\n  outer loop\n`;
    s+=`   vertex ${a[0].toFixed(6)} ${a[1].toFixed(6)} ${a[2].toFixed(6)}\n`;
    s+=`   vertex ${b[0].toFixed(6)} ${b[1].toFixed(6)} ${b[2].toFixed(6)}\n`;
    s+=`   vertex ${c[0].toFixed(6)} ${c[1].toFixed(6)} ${c[2].toFixed(6)}\n  endloop\n endfacet\n`;
  }
  s+='endsolid g_CAD_Metal\n';
  downloadBlob(new Blob([s],{type:'model/stl'}),`g-CAD_ring_${params.ringSize}_stone_${params.stoneDiameter.toFixed(1)}mm.stl`);
  status('STLを書き出しました');
}

function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function saveProject(){
  const project={app:'g-CAD Online',version:'0.3',unit:'mm',savedAt:new Date().toISOString(),params};
  downloadBlob(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'g-CAD_project.json');status('プロジェクトを保存しました');
}
function openProject(file){
  const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);const old=snapshot();applyParams(d.params||d);commitChange('プロジェクトを読み込み',old);fitView();status('プロジェクトを読み込みました')}catch(e){alert('プロジェクトファイルを読み込めませんでした。')}};r.readAsText(file);
}
function status(text){document.getElementById('statusText').textContent=text;}

function initRingSizes(){
  const s=document.getElementById('ringSize');
  for(let n=1;n<=30;n+=0.5){const o=document.createElement('option');o.value=String(n);o.textContent=n+'号';s.appendChild(o);}
}

canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;camera.yaw+=dx*0.008;camera.pitch=clamp(camera.pitch+dy*0.008,-Math.PI/2,Math.PI/2);camera.perspective=true;render();});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=clamp(camera.zoom*Math.exp(e.deltaY*0.001),6,120);render()},{passive:false});
canvas.addEventListener('dblclick',fitView);window.addEventListener('resize',render);

document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.getElementById('fitBtn').addEventListener('click',fitView);
document.getElementById('exportBtn').addEventListener('click',exportSTL);document.getElementById('exportBtn2').addEventListener('click',exportSTL);
document.getElementById('saveBtn').addEventListener('click',saveProject);
document.getElementById('openBtn').addEventListener('click',()=>document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change',e=>{if(e.target.files[0])openProject(e.target.files[0]);e.target.value='';});
document.getElementById('newBtn').addEventListener('click',()=>{params=structuredClone(DEFAULTS);historyEntries=['新規ソリテールリングを作成'];undoStack=[];redoStack=[];syncUI();buildModel();fitView();renderHistory();updateButtons();status('新規プロジェクト');});
document.getElementById('undoBtn').addEventListener('click',()=>{if(!undoStack.length)return;redoStack.push(snapshot());const s=undoStack.pop();applyParams(JSON.parse(s));historyEntries.unshift('元に戻す');renderHistory();updateButtons();status('元に戻しました');});
document.getElementById('redoBtn').addEventListener('click',()=>{if(!redoStack.length)return;undoStack.push(snapshot());const s=redoStack.pop();applyParams(JSON.parse(s));historyEntries.unshift('やり直す');renderHistory();updateButtons();status('やり直しました');});

initRingSizes();syncUI();bindInputs();renderHistory();updateButtons();buildModel();setView('iso');status('準備完了 — パラメータを変更して形状を編集できます');
});

window.addEventListener('gcad-auth-ready', () => {
'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

let objects = [];
let selectedId = null;
let activeSketch = null;
let nextId = 1;
let undoStack = [];
let redoStack = [];
let settings = { showGrid:true, wireframe:false, snapGrid:true };
let camera = { yaw:-0.72, pitch:0.60, zoom:40, target:[0,0,0] };
let dragging=false, lastX=0, lastY=0, dragMoved=false;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function add(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function mul(a,s){return [a[0]*s,a[1]*s,a[2]*s];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function len(a){return Math.hypot(a[0],a[1],a[2]);}
function norm(a){const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];}
function rotateX(p,a){const c=Math.cos(a),s=Math.sin(a);return [p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c];}
function rotateZ(p,a){const c=Math.cos(a),s=Math.sin(a);return [p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]];}
function uid(){return 'o'+(nextId++);}
function mesh(name){return {name,vertices:[],faces:[]};}
function tri(m,a,b,c){m.faces.push([a,b,c]);}
function num(id, fallback=0){const v=parseFloat($(id).value);return Number.isFinite(v)?v:fallback;}
function deepCopy(v){return JSON.parse(JSON.stringify(v));}

function snapshot(){return {objects:deepCopy(objects),selectedId,nextId};}
function restore(s){objects=deepCopy(s.objects||[]);selectedId=s.selectedId||null;nextId=s.nextId||1;activeSketch=null;refreshAll();}
function mutate(label, fn){const before=snapshot();fn();undoStack.push({state:before,label});if(undoStack.length>60)undoStack.shift();redoStack=[];setStatus(label);refreshAll();}

function rotateView(p){let q=sub(p,camera.target);q=rotateZ(q,-camera.yaw);q=rotateX(q,-camera.pitch);return q;}
function project(p,w,h){const q=rotateView(p);const scale=Math.min(w,h)/camera.zoom;return [w/2+q[0]*scale,h/2-q[1]*scale,q[2]];}
function worldFromTopScreen(x,y){const r=canvas.getBoundingClientRect();const scale=Math.min(r.width,r.height)/camera.zoom;let wx=(x-r.width/2)/scale+camera.target[0];let wy=-(y-r.height/2)/scale+camera.target[1];if(settings.snapGrid){wx=Math.round(wx*2)/2;wy=Math.round(wy*2)/2;}return [wx,wy];}

function setView(name){
  if(name==='top'){camera.yaw=0;camera.pitch=0;}
  if(name==='front'){camera.yaw=0;camera.pitch=Math.PI/2;}
  if(name==='right'){camera.yaw=Math.PI/2;camera.pitch=Math.PI/2;}
  if(name==='iso'){camera.yaw=-0.72;camera.pitch=0.60;}
  render();
}

function drawGrid(w,h){
  if(!settings.showGrid)return;
  const half=Math.max(20,camera.zoom*0.7), step=camera.zoom>80?10:camera.zoom>40?5:2;
  ctx.lineWidth=1;
  for(let i=-half;i<=half;i+=step){
    let a=project([i,-half,0],w,h),b=project([i,half,0],w,h);ctx.strokeStyle=Math.abs(i)<1e-6?'#526173':'#252b33';ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
    a=project([-half,i,0],w,h);b=project([half,i,0],w,h);ctx.strokeStyle=Math.abs(i)<1e-6?'#526173':'#252b33';ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
  }
}

function renderMesh(m,w,h,selected,triangles){
  const pv=m.vertices.map(v=>project(v,w,h));
  for(const f of m.faces){
    const a3=rotateView(m.vertices[f[0]]),b3=rotateView(m.vertices[f[1]]),c3=rotateView(m.vertices[f[2]]);
    const n=norm(cross(sub(b3,a3),sub(c3,a3)));
    const pa=pv[f[0]],pb=pv[f[1]],pc=pv[f[2]];
    const sc=(pb[0]-pa[0])*(pc[1]-pa[1])-(pb[1]-pa[1])*(pc[0]-pa[0]);
    if(!settings.wireframe && sc>0)continue;
    triangles.push({pa,pb,pc,z:(pa[2]+pb[2]+pc[2])/3,n,selected});
  }
}

function shade(normal,selected){const l=norm([0.35,-0.45,1]);const lum=clamp(.28+.72*Math.max(0,dot(normal,l)),.22,1);if(selected)return `rgb(${Math.round(90*lum+40)},${Math.round(165*lum+35)},${Math.round(235*lum+20)})`;return `rgb(${Math.round(205*lum)},${Math.round(178*lum)},${Math.round(92*lum)})`;}

function renderSketch(obj,w,h,selected=false,temp=false){
  const pts=obj.points||[];if(!pts.length)return;
  ctx.lineWidth=selected?2.2:1.6;ctx.strokeStyle=temp?'#8dd6ff':selected?'#8fd3ff':'#67c7ff';ctx.fillStyle=ctx.strokeStyle;
  ctx.beginPath();
  pts.forEach((p,i)=>{const s=project([p[0],p[1],0],w,h);if(i===0)ctx.moveTo(s[0],s[1]);else ctx.lineTo(s[0],s[1]);});
  if(obj.closed&&pts.length>2){const s=project([pts[0][0],pts[0][1],0],w,h);ctx.lineTo(s[0],s[1]);}
  ctx.stroke();
  for(const p of pts){const s=project([p[0],p[1],0],w,h);ctx.beginPath();ctx.arc(s[0],s[1],selected?3.5:2.5,0,Math.PI*2);ctx.fill();}
}

function render(){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);const W=Math.max(1,Math.round(r.width*dpr)),H=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);drawGrid(r.width,r.height);
  const tris=[];
  for(const o of objects)if(o.type==='solid')renderMesh(o.mesh,r.width,r.height,o.id===selectedId,tris);
  tris.sort((a,b)=>a.z-b.z);
  for(const t of tris){ctx.beginPath();ctx.moveTo(t.pa[0],t.pa[1]);ctx.lineTo(t.pb[0],t.pb[1]);ctx.lineTo(t.pc[0],t.pc[1]);ctx.closePath();if(settings.wireframe){ctx.strokeStyle=t.selected?'#8fd3ff':'#d1ad4a';ctx.lineWidth=t.selected?1.2:.7;ctx.stroke();}else{ctx.fillStyle=shade(t.n,t.selected);ctx.fill();ctx.strokeStyle=t.selected?'#8fd3ff':'#514627';ctx.lineWidth=t.selected?1:.35;ctx.stroke();}}
  for(const o of objects)if(o.type==='sketch')renderSketch(o,r.width,r.height,o.id===selectedId,false);
  if(activeSketch)renderSketch({points:activeSketch.points,closed:activeSketch.kind==='profile'},r.width,r.height,false,true);
  updateViewInfo();
}

function polygonArea(p){let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1];}return a/2;}
function pointInTri(p,a,b,c){const s=(p1,p2,p3)=>(p1[0]-p3[0])*(p2[1]-p3[1])-(p2[0]-p3[0])*(p1[1]-p3[1]);const d1=s(p,a,b),d2=s(p,b,c),d3=s(p,c,a);const neg=d1<0||d2<0||d3<0,pos=d1>0||d2>0||d3>0;return !(neg&&pos);}
function triangulate2D(points){
  if(points.length<3)return[];let idx=points.map((_,i)=>i);if(polygonArea(points)<0)idx.reverse();const out=[];let guard=0;
  while(idx.length>3&&guard++<500){let ear=false;for(let k=0;k<idx.length;k++){const ia=idx[(k-1+idx.length)%idx.length],ib=idx[k],ic=idx[(k+1)%idx.length];const a=points[ia],b=points[ib],c=points[ic];const cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(cr<=1e-9)continue;let inside=false;for(const j of idx){if(j===ia||j===ib||j===ic)continue;if(pointInTri(points[j],a,b,c)){inside=true;break;}}if(inside)continue;out.push([ia,ib,ic]);idx.splice(k,1);ear=true;break;}if(!ear)break;}
  if(idx.length===3)out.push([idx[0],idx[1],idx[2]]);return out;
}

function makeExtrude(points,height,name='押し出し'){
  const m=mesh(name),n=points.length;for(const p of points)m.vertices.push([p[0],p[1],0]);for(const p of points)m.vertices.push([p[0],p[1],height]);
  for(let i=0;i<n;i++){const j=(i+1)%n;tri(m,i,j,n+i);tri(m,j,n+j,n+i);}
  const caps=triangulate2D(points);for(const f of caps){tri(m,f[2],f[1],f[0]);tri(m,n+f[0],n+f[1],n+f[2]);}return m;
}

function makeBox(x,y,z){const hx=x/2,hy=y/2;const m=mesh('四角');m.vertices=[[-hx,-hy,0],[hx,-hy,0],[hx,hy,0],[-hx,hy,0],[-hx,-hy,z],[hx,-hy,z],[hx,hy,z],[-hx,hy,z]];[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].forEach(f=>tri(m,...f));return m;}
function makeEllipsoid(dx,dy,dz){const m=mesh('球体'),rx=dx/2,ry=dy/2,rz=dz/2,segU=36,segV=18;for(let j=0;j<=segV;j++){const v=-Math.PI/2+j/segV*Math.PI;for(let i=0;i<segU;i++){const u=i/segU*Math.PI*2;m.vertices.push([rx*Math.cos(v)*Math.cos(u),ry*Math.cos(v)*Math.sin(u),rz*Math.sin(v)+rz]);}}for(let j=0;j<segV;j++)for(let i=0;i<segU;i++){const ni=(i+1)%segU,a=j*segU+i,b=j*segU+ni,c=(j+1)*segU+ni,d=(j+1)*segU+i;tri(m,a,b,d);tri(m,b,c,d);}return m;}

function centroid2D(p){let x=0,y=0;for(const q of p){x+=q[0];y+=q[1];}return [x/p.length,y/p.length];}
function makeSweep(pathPts,profilePts){
  const m=mesh('スイープ'),pc=centroid2D(profilePts),prof=profilePts.map(p=>[p[0]-pc[0],p[1]-pc[1]]),pn=prof.length,kn=pathPts.length;
  for(let k=0;k<kn;k++){const prev=pathPts[Math.max(0,k-1)],next=pathPts[Math.min(kn-1,k+1)];let t=norm([next[0]-prev[0],next[1]-prev[1],0]);if(len(t)<1e-8)t=[1,0,0];const side=norm([-t[1],t[0],0]),up=[0,0,1],base=[pathPts[k][0],pathPts[k][1],0];for(const p of prof)m.vertices.push(add(base,add(mul(side,p[0]),mul(up,p[1]))));}
  for(let k=0;k<kn-1;k++)for(let i=0;i<pn;i++){const j=(i+1)%pn,a=k*pn+i,b=k*pn+j,c=(k+1)*pn+j,d=(k+1)*pn+i;tri(m,a,b,d);tri(m,b,c,d);}
  const caps=triangulate2D(prof);for(const f of caps){tri(m,f[2],f[1],f[0]);const o=(kn-1)*pn;tri(m,o+f[0],o+f[1],o+f[2]);}return m;
}

function objectById(id){return objects.find(o=>o.id===id);}
function sketchOptions(kind){return objects.filter(o=>o.type==='sketch'&&o.sketchKind===kind);}
function optionHtml(arr,empty){return arr.length?arr.map(o=>`<option value="${o.id}">${o.name}</option>`).join(''):`<option value="">${empty}</option>`;}

function refreshTree(){
  const tree=$('modelTree');if(!objects.length){tree.innerHTML='<div class="treeEmpty">まだ何もありません</div>';return;}
  tree.innerHTML=objects.map(o=>`<div class="treeItem ${o.id===selectedId?'selected':''}" data-id="${o.id}"><span class="dot ${o.type}"></span><span>${o.name}</span><small>${o.type==='sketch'?(o.sketchKind==='path'?'Path':'Profile'):'Solid'}</small></div>`).join('');
  tree.querySelectorAll('.treeItem').forEach(el=>el.addEventListener('click',()=>{selectedId=el.dataset.id;refreshAll();}));
}
function refreshSelects(){const profiles=sketchOptions('profile'),paths=sketchOptions('path');$('extrudeProfile').innerHTML=optionHtml(profiles,'断面がありません');$('sweepProfile').innerHTML=optionHtml(profiles,'断面がありません');$('sweepPath').innerHTML=optionHtml(paths,'パスがありません');}
function refreshSelection(){const o=objectById(selectedId);if(!o){$('selectionInfo').textContent='オブジェクトを選択してください。';return;}$('selectionInfo').innerHTML=`<strong>${o.name}</strong><br>${o.type==='sketch'?(o.sketchKind==='path'?'線・パス':'閉じた断面'):'立体'}<br>${o.type==='sketch'?`${o.points.length}点`:`${o.mesh.faces.length.toLocaleString()} triangles`}`;}
function solidObjects(){return objects.filter(o=>o.type==='solid');}
function refreshExport(){const solids=solidObjects(),tris=solids.reduce((s,o)=>s+o.mesh.faces.length,0);$('exportSummary').innerHTML=solids.length?`立体: <strong>${solids.length}</strong><br>三角形: <strong>${tris.toLocaleString()}</strong>`:'立体がありません。';$('triText').textContent=tris?`${tris.toLocaleString()} triangles`:'';}
function refreshAll(){refreshTree();refreshSelects();refreshSelection();refreshExport();render();}

function updateViewInfo(){const sketchCount=objects.filter(o=>o.type==='sketch').length,solidCount=solidObjects().length;$('viewInfo').innerHTML=`Sketch ${sketchCount}<br>Solid ${solidCount}<br>Zoom ${camera.zoom.toFixed(1)} mm`;}
function setStatus(t){$('statusText').textContent=t;}
function focusPanel(id){document.querySelectorAll('#right .section').forEach(x=>x.style.outline='');const el=$(id);if(el){el.style.outline='1px solid #41678a';el.scrollIntoView({block:'nearest'});setTimeout(()=>el.style.outline='',900);}}

function beginSketch(kind){
  if(activeSketch)return;activeSketch={kind,points:[]};setView('top');$('sketchControls').style.display='block';$('pathTool').classList.toggle('active',kind==='path');$('profileTool').classList.toggle('active',kind==='profile');$('sketchModeText').innerHTML=kind==='path'?'<b>線・パス作成中</b><br>クリックで折れ線の点を追加します。':'<b>断面・面作成中</b><br>3点以上クリックし、確定すると閉じた面になります。';canvas.style.cursor='crosshair';setStatus(kind==='path'?'パスを作図中':'断面を作図中');render();}
function endSketch(cancel=false){
  if(!activeSketch)return;if(!cancel){const min=activeSketch.kind==='path'?2:3;if(activeSketch.points.length<min){setStatus(`点が不足しています（${min}点以上必要）`);return;}const kind=activeSketch.kind,count=objects.filter(o=>o.type==='sketch'&&o.sketchKind===kind).length+1;const obj={id:uid(),type:'sketch',sketchKind:kind,name:(kind==='path'?'パス ':'断面 ')+count,points:deepCopy(activeSketch.points),closed:kind==='profile'};mutate(obj.name+' を作成',()=>objects.push(obj));selectedId=obj.id;}
  activeSketch=null;$('sketchControls').style.display='none';$('pathTool').classList.remove('active');$('profileTool').classList.remove('active');canvas.style.cursor='default';if(cancel){setStatus('作図をキャンセル');refreshAll();}
}

canvas.addEventListener('pointerdown',e=>{
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(activeSketch&&e.button===0){const p=worldFromTopScreen(x,y);const last=activeSketch.points[activeSketch.points.length-1];if(!last||Math.hypot(last[0]-p[0],last[1]-p[1])>.001){activeSketch.points.push(p);setStatus(`点 ${activeSketch.points.length}: X ${p[0].toFixed(2)} / Y ${p[1].toFixed(2)} mm`);render();}return;}
  dragging=true;dragMoved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)dragMoved=true;lastX=e.clientX;lastY=e.clientY;camera.yaw+=dx*.008;camera.pitch=clamp(camera.pitch+dy*.008,-1.50,1.50);render();});
canvas.addEventListener('pointerup',()=>dragging=false);
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=clamp(camera.zoom*Math.exp(e.deltaY*.001),5,300);render();},{passive:false});
canvas.addEventListener('dblclick',()=>fitAll());

function allPoints(){const p=[];for(const o of objects){if(o.type==='sketch')for(const q of o.points)p.push([q[0],q[1],0]);else if(o.type==='solid')p.push(...o.mesh.vertices);}return p;}
function fitAll(){const p=allPoints();if(!p.length){camera.target=[0,0,0];camera.zoom=40;render();return;}let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];for(const q of p)for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],q[i]);mx[i]=Math.max(mx[i],q[i]);}camera.target=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2];camera.zoom=Math.max(8,Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2])*1.6);render();}

function addSolid(name,m){const obj={id:uid(),type:'solid',name,mesh:m};objects.push(obj);selectedId=obj.id;return obj;}
$('createExtrude').addEventListener('click',()=>{const p=objectById($('extrudeProfile').value),h=num('extrudeHeight',3);if(!p||p.sketchKind!=='profile'||h<=0){setStatus('押し出す断面と高さを確認してください');return;}mutate('押し出しを作成',()=>addSolid('押し出し '+(solidObjects().length+1),makeExtrude(p.points,h)));});
$('createSweep').addEventListener('click',()=>{const path=objectById($('sweepPath').value),profile=objectById($('sweepProfile').value);if(!path||!profile){setStatus('パスと断面を選択してください');return;}mutate('スイープを作成',()=>addSolid('スイープ '+(solidObjects().length+1),makeSweep(path.points,profile.points)));});
$('createBox').addEventListener('click',()=>{const x=num('boxX',10),y=num('boxY',8),z=num('boxZ',3);if(Math.min(x,y,z)<=0)return;mutate('四角を作成',()=>addSolid('四角 '+(solidObjects().length+1),makeBox(x,y,z)));fitAll();});
$('createSphere').addEventListener('click',()=>{const x=num('sphereX',8),y=num('sphereY',8),z=num('sphereZ',8);if(Math.min(x,y,z)<=0)return;mutate('球体を作成',()=>addSolid('球体 '+(solidObjects().length+1),makeEllipsoid(x,y,z)));fitAll();});

$('pathTool').addEventListener('click',()=>beginSketch('path'));$('profileTool').addEventListener('click',()=>beginSketch('profile'));$('finishSketch').addEventListener('click',()=>endSketch(false));$('cancelSketch').addEventListener('click',()=>endSketch(true));
$('extrudeFocus').addEventListener('click',()=>focusPanel('extrudePanel'));$('sweepFocus').addEventListener('click',()=>focusPanel('sweepPanel'));$('boxFocus').addEventListener('click',()=>focusPanel('boxPanel'));$('sphereFocus').addEventListener('click',()=>focusPanel('spherePanel'));
$('deleteSelected').addEventListener('click',()=>{if(!selectedId)return;const o=objectById(selectedId);mutate((o?.name||'選択')+' を削除',()=>{objects=objects.filter(x=>x.id!==selectedId);selectedId=null;});});
$('showGrid').addEventListener('change',e=>{settings.showGrid=e.target.checked;render();});$('wireframe').addEventListener('change',e=>{settings.wireframe=e.target.checked;render();});$('snapGrid').addEventListener('change',e=>settings.snapGrid=e.target.checked);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));$('fitBtn').addEventListener('click',fitAll);

$('newBtn').addEventListener('click',()=>{if(objects.length&&!confirm('現在の作業内容を消して新規作成しますか？'))return;objects=[];selectedId=null;nextId=1;undoStack=[];redoStack=[];activeSketch=null;camera={yaw:-.72,pitch:.60,zoom:40,target:[0,0,0]};setStatus('空の作業空間を作成');refreshAll();});
$('undoBtn').addEventListener('click',()=>{if(!undoStack.length)return;const cur=snapshot(),entry=undoStack.pop();redoStack.push({state:cur,label:entry.label});restore(entry.state);setStatus('元に戻す: '+entry.label);});
$('redoBtn').addEventListener('click',()=>{if(!redoStack.length)return;const cur=snapshot(),entry=redoStack.pop();undoStack.push({state:cur,label:entry.label});restore(entry.state);setStatus('やり直す: '+entry.label);});

$('saveBtn').addEventListener('click',()=>{const data={format:'g-CAD',version:'0.4',units:'mm',nextId,objects};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});downloadBlob(blob,'g-CAD-project.json');setStatus('プロジェクトを保存しました');});
$('openBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.objects))throw new Error('invalid');objects=data.objects;nextId=data.nextId||1000;selectedId=null;undoStack=[];redoStack=[];setStatus('プロジェクトを開きました');refreshAll();fitAll();}catch{alert('g-CADプロジェクトを読み込めませんでした。');}e.target.value='';});

function stlText(){let out='solid g_CAD\n';for(const o of solidObjects()){const m=o.mesh;for(const f of m.faces){const a=m.vertices[f[0]],b=m.vertices[f[1]],c=m.vertices[f[2]],n=norm(cross(sub(b,a),sub(c,a)));out+=`  facet normal ${n[0]} ${n[1]} ${n[2]}\n    outer loop\n      vertex ${a[0]} ${a[1]} ${a[2]}\n      vertex ${b[0]} ${b[1]} ${b[2]}\n      vertex ${c[0]} ${c[1]} ${c[2]}\n    endloop\n  endfacet\n`;}}return out+'endsolid g_CAD\n';}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
function exportSTL(){if(!solidObjects().length){alert('STLへ書き出す立体がありません。');return;}downloadBlob(new Blob([stlText()],{type:'model/stl'}),'g-CAD-model.stl');setStatus('STLを書き出しました');}
$('exportBtn').addEventListener('click',exportSTL);$('exportBtn2').addEventListener('click',exportSTL);

window.addEventListener('resize',render);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&activeSketch)endSketch(true);if(e.key==='Enter'&&activeSketch)endSketch(false);if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('undoBtn').click();}});

refreshAll();
setStatus('空の作業空間です。2D作図または基本立体から開始してください。');
});

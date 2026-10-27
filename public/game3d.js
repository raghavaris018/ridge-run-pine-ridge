import * as THREE from '/vendor/three.module.js';

const $=id=>document.getElementById(id),track=window.PineTrack;
const PAINTS=['#f47745','#54cde2','#c6ee50'];
const state={room:null,me:null,name:'',isHost:false,players:[],mode:'online',stage:'home',countdownAt:0,startedAt:0,finishAt:0,keys:{},cars:new Map(),paused:false,muted:true,notice:'',practice:null};
const socket=window.io?window.io({autoConnect:false}):null;
let scene,camera,renderer,worldReady=false,lastFrame=0,lastHud=0,audioContext=null;
const display=new Map();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function setStatus(text,kind=''){ $('statusMessage').textContent=text;$('statusMessage').className=`status-message ${kind}`; }
function setScreen(name){for(const id of ['startScreen','lobbyScreen','raceScreen','resultsScreen'])$(id).classList.toggle('hidden',id!==name);}
function safeText(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function tokenKey(code){return `rr-token-${code}`;}
function getName(){const n=$('name').value.trim().slice(0,16);if(!n){setStatus('Choose a racer name first.','error');return '';}localStorage.setItem('rr-name',n);state.name=n;return n;}
function randomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(5);crypto.getRandomValues(bytes);return [...bytes].map(x=>chars[x%chars.length]).join('');}
function requestJoin(code){
  if(!socket){setStatus('Multiplayer server is unavailable. Try Practice mode.','error');return;}
  const name=getName();if(!name)return;
  if(!socket.connected){socket.connect();setStatus('Connecting to the race server…');}
  const joinNow=()=>socket.emit('join',{code,name,token:localStorage.getItem(tokenKey(code))},result=>{
    if(!result?.ok){setStatus(result?.error||'Could not join that room.','error');return;}
    state.room=code;state.me=result.token;state.isHost=result.isHost;state.mode='online';state.stage=result.state.stage;
    localStorage.setItem(tokenKey(code),result.token);history.replaceState({},'',`?room=${code}`);
    $('roomLabel').textContent=code;$('raceRoom').textContent=`ROOM ${code}`;setScreen('lobbyScreen');updateRoom(result.state);playTone(520,.09);
  });
  if(socket.connected)joinNow();else socket.once('connect',joinNow);
}
if(socket){
  socket.on('connect',()=>{
    setStatus('Race server connected. Create a room or join by code.','ok');
    if(state.room&&state.me&&state.mode==='online')socket.emit('join',{code:state.room,name:state.name,token:state.me},r=>{if(r?.ok){state.isHost=r.isHost;updateRoom(r.state);}});
  });
  socket.on('connect_error',()=>setStatus('Race server unavailable. You can still drive in Practice mode.','error'));
  socket.on('disconnect',()=>{if(state.mode==='online'&&state.stage==='race')$('connectionNotice').classList.remove('hidden');});
  socket.on('state',updateRoom);
  socket.on('notice',message=>{$('lobbyMessage').textContent=message;});
}

$('name').value=localStorage.getItem('rr-name')||'';
const urlRoom=new URLSearchParams(location.search).get('room');
if(urlRoom){$('roomCode').value=urlRoom.toUpperCase();state.room=urlRoom.toUpperCase();state.name=$('name').value;state.me=localStorage.getItem(tokenKey(state.room));}
if(socket){socket.connect();if(state.room&&state.me)socket.once('connect',()=>socket.emit('join',{code:state.room,name:state.name,token:state.me},r=>{if(r?.ok){state.isHost=r.isHost;state.stage=r.state.stage;$('roomLabel').textContent=state.room;setScreen('lobbyScreen');updateRoom(r.state);}}));}
$('createRoom').addEventListener('click',()=>{const n=getName();if(n)requestJoin(randomCode());});
$('joinRoom').addEventListener('click',()=>{const code=$('roomCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length<4){setStatus('Enter a room code with at least 4 characters.','error');return;}requestJoin(code);});
$('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinRoom').click();});
$('shareRoom').addEventListener('click',async()=>{const url=`${location.origin}${location.pathname}?room=${state.room}`;try{await navigator.clipboard.writeText(url);$('shareRoom').textContent='Invite link copied ✓';}catch{prompt('Share this invite link:',url);}setTimeout(()=>$('shareRoom').textContent='Copy invite link ↗',1800);});
$('readyButton').addEventListener('click',()=>{const p=state.players.find(x=>x.id===state.me);if(p)socket?.emit('ready',!p.ready);});
$('startRaceButton').addEventListener('click',()=>socket?.emit('startRace'));
$('raceAgain').addEventListener('click',()=>{if(state.mode==='practice'){startPractice(true);}else socket?.emit('raceAgain');});
$('backHome').addEventListener('click',()=>{if(socket?.connected)socket.disconnect();location.href=location.pathname;});
$('practice').addEventListener('click',()=>{if(!getName())return;startPractice(false);});
$('showControls').addEventListener('click',()=>$('controlsModal').classList.remove('hidden'));
$('closeControls').addEventListener('click',()=>$('controlsModal').classList.add('hidden'));
$('mute').addEventListener('click',()=>{state.muted=!state.muted;$('mute').innerHTML=state.muted?'♫ <span>SOUND</span>':'♫ <span>SOUND ON</span>';if(!state.muted)playTone(620,.12);});
$('pause').addEventListener('click',togglePause);$('resumeRace').addEventListener('click',togglePause);
$('dismissTutorial').addEventListener('click',()=>$('tutorial').classList.add('hidden'));
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.stage==='race'){e.preventDefault();togglePause();return;}const map={w:'accelerate',ArrowUp:'accelerate',s:'brake',ArrowDown:'brake',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right',Shift:'nitro',' ':'drift',r:'reset'};const k=map[e.key]||map[e.key.toLowerCase()];if(k){e.preventDefault();state.keys[k]=true;}});
window.addEventListener('keyup',e=>{const map={w:'accelerate',ArrowUp:'accelerate',s:'brake',ArrowDown:'brake',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right',Shift:'nitro',' ':'drift',r:'reset'};const k=map[e.key]||map[e.key.toLowerCase()];if(k)state.keys[k]=false;});
document.querySelectorAll('[data-key]').forEach(btn=>{const k=btn.dataset.key;btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);state.keys[k]=true;});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,()=>state.keys[k]=false));});
setInterval(()=>{if(state.mode==='online'&&state.stage==='race'&&socket?.connected&&!state.paused)socket.emit('input',{...state.keys,drift:state.keys.drift||!!(state.keys.accelerate&&(state.keys.left||state.keys.right))});},50);

function updateRoom(room){
  state.players=room.players||[];state.trackLength=room.trackLength;state.stage=room.stage;state.countdownAt=room.countdownAt;state.startedAt=room.startedAt;state.isHost=room.hostId===state.me;
  const ordered=[...state.players].sort((a,b)=>b.progress-a.progress);
  $('playerCount').textContent=`${state.players.length} / 8`;
  $('roster').innerHTML=state.players.map(p=>`<div class="roster-item"><span class="avatar" style="background:${p.color}">${safeText(p.name.slice(0,1).toUpperCase())}</span><div><div class="roster-name">${safeText(p.name)}${p.id===state.me?' <small>(YOU)</small>':''}</div><div class="roster-state">${p.connected?(p.ready?'READY':'CHOOSING CAR'):'RECONNECTING…'}${p.id===state.me&&state.isHost?' · HOST':''}</div></div></div>`).join('')+Array.from({length:Math.max(0,2-state.players.length)},()=>'<div class="roster-item open-slot"><span class="avatar">+</span><div class="roster-name">Invite a racer</div></div>').join('');
  const me=state.players.find(p=>p.id===state.me);$('readyButton').classList.toggle('ready',!!me?.ready);$('readyButton').innerHTML=me?.ready?'Ready <span>✓</span>':'Ready up <span>✓</span>';
  $('startRaceButton').classList.toggle('hidden',!state.isHost||room.stage!=='lobby');
  $('lobbyMessage').textContent=state.isHost?'When everyone is ready, start the synchronized race.':'Waiting for the host to start.';
  $('raceStandings').innerHTML=ordered.map((p,i)=>`<div class="standings-line ${p.id===state.me?'me':''}"><b class="pos">${String(i+1).padStart(2,'0')}</b><span class="driver">${safeText(p.name)}${!p.connected?' · reconnecting':''}</span><span class="dist">${Math.max(0,(room.trackLength-p.progress)/1000).toFixed(1)}km</span></div>`).join('');
  for(const p of state.players){if(!display.has(p.id))display.set(p.id,{progress:p.progress,lateral:p.lateral});const d=display.get(p.id);d.targetProgress=p.progress;d.targetLateral=p.lateral;}
  if(room.stage==='lobby'){setScreen('lobbyScreen');$('connectionNotice').classList.add('hidden');}
  if(room.stage==='countdown'||room.stage==='race'){setScreen('raceScreen');ensureWorld();if(room.stage==='race'&&state.previousStage!=='race'){playTone(720,.16);if(!localStorage.getItem('rr-tutorial')){$('tutorial').classList.remove('hidden');localStorage.setItem('rr-tutorial','seen');}}}
  if(room.stage==='results')showResults(ordered,room.startedAt);
  const meState=state.players.find(p=>p.id===state.me);if(meState)state.paused=!!meState.paused;
  state.previousStage=room.stage;
}
function makeCarPicker(){const box=$('carPicker');box.innerHTML=PAINTS.map(c=>`<button class="car-choice" data-color="${c}" aria-label="Choose paint ${c}"><span class="car-swatch" style="background:${c}"></span></button>`).join('');box.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{box.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');socket?.emit('chooseCar',btn.dataset.color);}));box.querySelector('button')?.classList.add('selected');}
makeCarPicker();
function showResults(players,startedAt){
  setScreen('resultsScreen');$('raceAgain').classList.toggle('hidden',!state.isHost&&state.mode==='online');
  const sorted=[...players].sort((a,b)=>{if(a.finishMs==null&&b.finishMs==null)return b.progress-a.progress;if(a.finishMs==null)return 1;if(b.finishMs==null)return -1;return a.finishMs-b.finishMs;});
  $('resultTitle').textContent=sorted[0]?.id===state.me?'You took the win.':'Race complete.';
  $('resultTime').textContent=sorted[0]?.finishMs!=null?formatTime(sorted[0].finishMs):'Results';
  $('resultsList').innerHTML=sorted.map((p,i)=>`<div class="result-row"><span class="place">${String(i+1).padStart(2,'0')}</span><span class="avatar" style="background:${p.color}">${safeText(p.name.slice(0,1).toUpperCase())}</span><span class="res-name">${safeText(p.name)}${p.id===state.me?' · YOU':''}</span><span class="res-time">${p.finishMs==null?'DNF':formatTime(p.finishMs)}</span></div>`).join('');
}
function formatTime(ms){const t=Math.max(0,ms)/1000;return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}.${Math.floor(t%1*10)}`;}
function startPractice(again){
  state.mode='practice';state.room=null;state.me='practice';state.isHost=true;state.practice={id:'practice',name:state.name,color:PAINTS[0],progress:0,lateral:0,speed:0,nitro:100,drifting:false,ready:true,connected:true,finished:false,finishMs:null};state.players=[state.practice];state.stage='countdown';state.countdownAt=Date.now()+2800;state.startedAt=Date.now()+2800;state.paused=false;state.keys={};
  setScreen('raceScreen');$('raceRoom').textContent='PRACTICE · PINE RIDGE';$('tutorial').classList.toggle('hidden',!!localStorage.getItem('rr-tutorial'));if(!localStorage.getItem('rr-tutorial'))localStorage.setItem('rr-tutorial','seen');ensureWorld();updateMinimap();
}
function togglePause(){if(state.stage!=='race')return;state.paused=!state.paused;$('pauseOverlay').classList.toggle('hidden',!state.paused);state.keys={};if(state.mode==='online')socket?.emit('pauseRace',state.paused);}
function playTone(freq,duration){if(state.muted)return;try{audioContext=audioContext||new AudioContext();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(.04,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration);}catch{}}

function ensureWorld(){if(worldReady)return;const host=$('world');scene=new THREE.Scene();scene.background=new THREE.Color('#b9cbbd');scene.fog=new THREE.FogExp2('#b9cbbd',.00115);camera=new THREE.PerspectiveCamera(69,host.clientWidth/host.clientHeight,.1,1600);renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.setSize(host.clientWidth,host.clientHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;host.prepend(renderer.domElement);buildTrackWorld();worldReady=true;window.addEventListener('resize',resizeWorld);requestAnimationFrame(renderFrame);}
function resizeWorld(){if(!renderer)return;const host=$('world');camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);}
function buildTrackWorld(){
  scene.add(new THREE.HemisphereLight('#e7f1e8','#52664c',2.0));const sun=new THREE.DirectionalLight('#fff0cf',2.4);sun.position.set(-190,260,110);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-260;sun.shadow.camera.right=260;sun.shadow.camera.top=260;sun.shadow.camera.bottom=-260;scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),new THREE.MeshStandardMaterial({color:'#526e4e',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.6;ground.receiveShadow=true;scene.add(ground);
  // Distant mountain shapes frame Pine Ridge without hiding the road.
  const mountainMat=new THREE.MeshStandardMaterial({color:'#718778',flatShading:true,roughness:1});for(let i=0;i<18;i++){const a=i/18*Math.PI*2,r=390+(i%4)*45,mesh=new THREE.Mesh(new THREE.ConeGeometry(42+(i%5)*8,75+(i%6)*16,5),mountainMat);mesh.position.set(Math.cos(a)*r,28,Math.sin(a)*r);mesh.rotation.y=i*.47;mesh.castShadow=true;scene.add(mesh);}
  makeRoad();makeForest();makeRails();makeGates();
}
function makeRibbon(halfWidth,material,yOffset=0){const n=900,pos=[],uv=[],idx=[];for(let i=0;i<=n;i++){const p=track.atDistance(track.length*i/n),nx=p.tz,nz=-p.tx;for(const side of [-1,1]){pos.push(p.x+nx*halfWidth*side,p.y+yOffset,p.z+nz*halfWidth*side);uv.push(i/n*36,side*.5);}}for(let i=0;i<n;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,material);m.receiveShadow=true;scene.add(m);}
function makeRoad(){
  const roadMat=new THREE.MeshStandardMaterial({color:'#343b3a',roughness:.88,metalness:.02,side:THREE.DoubleSide});makeRibbon(7.6,roadMat,.03);
  const edgeMat=new THREE.MeshStandardMaterial({color:'#e3dfc9',roughness:.8,side:THREE.DoubleSide});
  for(const side of [-1,1]){const pts=[],indices=[],n=900;for(let i=0;i<=n;i++){const p=track.atDistance(track.length*i/n),nx=p.tz*side,nz=-p.tx*side;pts.push(p.x+nx*7.05,p.y+.075,p.z+nz*7.05,p.x+nx*7.28,p.y+.075,p.z+nz*7.28);}for(let i=0;i<n;i++){let a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.setIndex(indices);g.computeVertexNormals();scene.add(new THREE.Mesh(g,edgeMat));}
  const dashMat=new THREE.MeshStandardMaterial({color:'#dbddc9',roughness:.7});for(let d=8;d<track.length;d+=17){const p=track.atDistance(d);for(const offset of [-2.5,2.5]){const dash=new THREE.Mesh(new THREE.BoxGeometry(.12,.035,4.4),dashMat);dash.position.set(p.x+p.tz*offset,p.y+.11,p.z-p.tx*offset);dash.rotation.y=p.angle;scene.add(dash);}}
  const curbMats=[new THREE.MeshStandardMaterial({color:'#e7e4d2'}),new THREE.MeshStandardMaterial({color:'#d85d48'})];for(let d=0,i=0;d<track.length;d+=3.3,i++){const p=track.atDistance(d);for(const side of [-1,1]){const curb=new THREE.Mesh(new THREE.BoxGeometry(.66,.13,1.9),curbMats[i%2]);curb.position.set(p.x+p.tz*side*7.88,p.y+.13,p.z-p.tx*side*7.88);curb.rotation.y=p.angle;scene.add(curb);}}
  // Checkered start/finish stripe, laid across the asphalt.
  const start=track.atDistance(0),sq=.95;for(let x=-7.1,c=0;x<7.1;x+=sq,c++){for(let row=0;row<2;row++){if((c+row)%2)continue;const tile=new THREE.Mesh(new THREE.BoxGeometry(sq,.04,1.15),new THREE.MeshStandardMaterial({color:'#f1f0e7'}));tile.position.set(start.x+start.tz*x,start.y+.16,start.z-start.tx*x);tile.rotation.y=start.angle;scene.add(tile);}}
}
function makeForest(){
  const trunkGeo=new THREE.CylinderGeometry(.35,.55,2.3,5),leafGeo1=new THREE.ConeGeometry(3.1,7.3,5),leafGeo2=new THREE.ConeGeometry(2.35,5.7,5);
  const trunk=new THREE.InstancedMesh(trunkGeo,new THREE.MeshStandardMaterial({color:'#604b38',flatShading:true}),340);const foliage1=new THREE.InstancedMesh(leafGeo1,new THREE.MeshStandardMaterial({color:'#244b36',flatShading:true}),340);const foliage2=new THREE.InstancedMesh(leafGeo2,new THREE.MeshStandardMaterial({color:'#315b3e',flatShading:true}),340);let seed=81621;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};const dummy=new THREE.Object3D();let k=0;
  for(let d=0;d<track.length;d+=10){const p=track.atDistance(d);for(const side of [-1,1]){const offset=23+rand()*47,x=p.x+p.tz*side*offset,z=p.z-p.tx*side*offset,h=7+rand()*8,scale=.75+rand()*.7;dummy.position.set(x,-.45,z);dummy.scale.set(scale,scale,scale);dummy.rotation.y=rand()*Math.PI*2;dummy.updateMatrix();trunk.setMatrixAt(k,dummy.matrix);dummy.position.y=1.5+h*.24;dummy.scale.set(scale,scale,scale);dummy.updateMatrix();foliage1.setMatrixAt(k,dummy.matrix);dummy.position.y=2.1+h*.52;dummy.scale.set(scale*.76,scale*.85,scale*.76);dummy.updateMatrix();foliage2.setMatrixAt(k,dummy.matrix);k++;}}
  trunk.count=foliage1.count=foliage2.count=k;trunk.castShadow=foliage1.castShadow=foliage2.castShadow=true;scene.add(trunk,foliage1,foliage2);
  // Low shrubs and boulders add roadside texture away from the racing line.
  const rockGeo=new THREE.DodecahedronGeometry(1.7,0),rocks=new THREE.InstancedMesh(rockGeo,new THREE.MeshStandardMaterial({color:'#74796c',flatShading:true}),120);for(let i=0;i<120;i++){const p=track.atDistance((i/120)*track.length),side=i%2?1:-1,off=18+rand()*19;dummy.position.set(p.x+p.tz*side*off,-.1,p.z-p.tx*side*off);dummy.scale.set(.7+rand(),.45+rand()*.8,.7+rand());dummy.rotation.set(rand(),rand(),rand());dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}rocks.castShadow=true;scene.add(rocks);
}
function makeRails(){const mat=new THREE.MeshStandardMaterial({color:'#876c4b',roughness:.9});for(const section of [[.18,.235],[.61,.67]]){for(let d=section[0]*track.length;d<section[1]*track.length;d+=5){const p=track.atDistance(d);for(const side of [-1,1]){const x=p.x+p.tz*side*9.7,z=p.z-p.tx*side*9.7;const post=new THREE.Mesh(new THREE.BoxGeometry(.25,1.5,.3),mat);post.position.set(x,p.y+.65,z);post.rotation.y=p.angle;scene.add(post);const rail=new THREE.Mesh(new THREE.BoxGeometry(.23,.24,5.2),mat);rail.position.set(x,p.y+1.25,z);rail.rotation.y=p.angle;scene.add(rail);}}}}
function makeGates(){for(let i=0;i<4;i++){const p=track.atDistance(track.length*(i+.5)/4),gold=new THREE.MeshStandardMaterial({color:i===3?'#d3f45b':'#e8dfbb',emissive:i===3?'#3c5211':'#000000'});for(const side of [-1,1]){const post=new THREE.Mesh(new THREE.BoxGeometry(.38,5.6,.38),gold);post.position.set(p.x+p.tz*side*7.3,p.y+2.8,p.z-p.tx*side*7.3);post.rotation.y=p.angle;scene.add(post);}const bar=new THREE.Mesh(new THREE.BoxGeometry(.32,.32,14.6),gold);bar.position.set(p.x,p.y+5.35,p.z);bar.rotation.y=p.angle;scene.add(bar);}}
function makeCar(color){const group=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color,metalness:.36,roughness:.29}),dark=new THREE.MeshStandardMaterial({color:'#17201e',metalness:.15,roughness:.35}),glass=new THREE.MeshStandardMaterial({color:'#91b3ae',metalness:.32,roughness:.19}),tire=new THREE.MeshStandardMaterial({color:'#101313',roughness:.85});const body=new THREE.Mesh(new THREE.BoxGeometry(1.9,.58,4.1),paint);body.position.y=.78;body.castShadow=true;group.add(body);const hood=new THREE.Mesh(new THREE.BoxGeometry(1.74,.22,1.35),paint);hood.position.set(0,1.08,1.13);group.add(hood);const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.43,.61,1.68),glass);cabin.position.set(0,1.22,-.28);group.add(cabin);const roof=new THREE.Mesh(new THREE.BoxGeometry(1.38,.12,.9),paint);roof.position.set(0,1.58,-.35);group.add(roof);const spoiler=new THREE.Mesh(new THREE.BoxGeometry(1.75,.11,.3),dark);spoiler.position.set(0,1.19,-1.82);group.add(spoiler);for(const x of [-.99,.99])for(const z of [-1.28,1.28]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.27,12),tire);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.43,z);wheel.castShadow=true;group.add(wheel);}const lamp=new THREE.MeshStandardMaterial({color:'#fff4d0',emissive:'#c7b77e',emissiveIntensity:.8});for(const x of [-.62,.62]){const light=new THREE.Mesh(new THREE.BoxGeometry(.36,.14,.08),lamp);light.position.set(x,.89,2.07);group.add(light);}const tail=new THREE.MeshStandardMaterial({color:'#ec4d3c',emissive:'#852318'});for(const x of [-.65,.65]){const light=new THREE.Mesh(new THREE.BoxGeometry(.33,.14,.08),tail);light.position.set(x,.89,-2.07);group.add(light);}return group;}
function updateCarModels(players){const active=new Set(players.map(p=>p.id));for(const p of players){let car=state.cars.get(p.id);if(!car){car=makeCar(p.color);scene.add(car);state.cars.set(p.id,car);const q=display.get(p.id)||{};q.progress=p.progress;q.lateral=p.lateral;q.targetProgress=p.progress;q.targetLateral=p.lateral;display.set(p.id,q);}if(car.userData.color!==p.color){car.traverse(o=>{if(o.isMesh&&o.material?.color&&o.geometry?.type==='BoxGeometry'&&o.geometry.parameters?.width===1.9)o.material.color.set(p.color);});car.userData.color=p.color;}const d=display.get(p.id);if(d){const a=1-Math.exp(-10*state.frameDt);d.progress+=(d.targetProgress-d.progress)*a;d.lateral+=(d.targetLateral-d.lateral)*a;const loc=track.atDistance(d.progress),nx=loc.tz,nz=-loc.tx;car.position.set(loc.x+nx*d.lateral,loc.y+.04,loc.z+nz*d.lateral);car.rotation.y=loc.angle+clamp(d.lateral*.018,-.14,.14);car.visible=p.connected||p.id===state.me;}}
  for(const [id,car] of state.cars)if(!active.has(id)){scene.remove(car);state.cars.delete(id);display.delete(id);}}
function updateMinimap(){const canvas=$('minimap'),c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad=12,pts=track.points, xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),scale=Math.min((w-pad*2)/(maxX-minX),(h-pad*2)/(maxZ-minZ));const pos=p=>[pad+(p.x-minX)*scale+(w-pad*2-(maxX-minX)*scale)/2,h-pad-(p.z-minZ)*scale-(h-pad*2-(maxZ-minZ)*scale)/2];c.clearRect(0,0,w,h);c.lineWidth=8;c.lineJoin='round';c.strokeStyle='#6d756b';c.beginPath();pts.forEach((p,i)=>{const[x,y]=pos(p);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.closePath();c.stroke();c.lineWidth=1.2;c.strokeStyle='#d9dfc6';c.setLineDash([4,4]);c.stroke();c.setLineDash([]);for(const p of state.players){const loc=track.atDistance(p.progress),[x,y]=pos(loc);c.fillStyle=p.color;c.beginPath();c.arc(x,y,p.id===state.me?4:3,0,Math.PI*2);c.fill();}c.fillStyle='#d3f45b';c.font='bold 8px sans-serif';c.fillText('S/F',pos(pts[0])[0]+5,pos(pts[0])[1]-5);}
function renderFrame(now){requestAnimationFrame(renderFrame);if(!renderer||!worldReady)return;const dt=Math.min(.06,(now-lastFrame)/1000||.016);lastFrame=now;state.frameDt=dt;
  if(state.mode==='practice'&&state.stage==='countdown'&&now>=state.countdownAt){state.stage='race';state.startedAt=Date.now();playTone(780,.2);}
  if(state.mode==='practice'&&state.stage==='race'&&!state.paused){simulatePractice(dt);}
  const remaining=state.countdownAt-Date.now();$('countdown').classList.toggle('hidden',!((state.stage==='countdown')||(state.mode==='practice'&&state.stage==='countdown')));if(state.stage==='countdown')$('countdown').textContent=remaining>0?Math.ceil(remaining/1000):'GO';
  const players=state.players;if(players.length)updateCarModels(players);
  const me=players.find(p=>p.id===state.me)||players[0];if(me){const loc=track.atDistance(display.get(me.id)?.progress??me.progress),back=10+(Math.max(me.speed,0)*.07),desired=new THREE.Vector3(loc.x-loc.tx*back,loc.y+5.1,loc.z-loc.tz*back);camera.position.lerp(desired,1-Math.exp(-4.5*dt));const ahead=track.atDistance((display.get(me.id)?.progress??me.progress)+9);camera.lookAt(ahead.x,ahead.y+1.2,ahead.z);$('speed').textContent=String(Math.round(Math.abs(me.speed)*3.6));$('nitroFill').style.width=`${clamp(me.nitro,0,100)}%`;$('nitroText').textContent=`${Math.round(me.nitro)}%`;$('rank').textContent=`P${[...players].sort((a,b)=>b.progress-a.progress).findIndex(p=>p.id===me.id)+1}`;$('lapLabel').textContent='LAP 1 / 1';$('checkpointLabel').textContent=`CHECKPOINT ${Math.min(4,Math.floor(me.progress/(track.length/4))+1)} / 4`;}
  if(state.stage==='race'){$('raceStatus').textContent=state.paused?'PAUSED':'RACE ON';$('raceTimer').textContent=formatTime(Date.now()-(state.startedAt||Date.now()));}
  if(now-lastHud>120){updateMinimap();lastHud=now;}
  renderer.render(scene,camera);
}
function simulatePractice(dt){const p=state.practice,i=state.keys,drifting=(i.drift||(i.accelerate&&(i.left||i.right)))&&(i.left||i.right||i.drift);if(i.accelerate)p.speed+=28*dt;else p.speed-=5*dt;if(i.brake)p.speed+=p.speed>0?-55*dt:-18*dt;if(i.nitro&&p.nitro>0&&p.speed>1){p.speed+=30*dt;p.nitro-=28*dt;}else p.nitro=Math.min(100,p.nitro+9*dt);p.speed=clamp(p.speed,-16,drifting?60:72);p.lateral=clamp(p.lateral+(Number(i.right)-Number(i.left))*(drifting?13:8)*(.35+Math.min(Math.abs(p.speed)/45,1))*dt,-8.3,8.3);if(i.reset){p.lateral=0;p.speed=0;i.reset=false;}p.drifting=drifting;p.progress=Math.max(0,p.progress+p.speed*dt);const d=display.get(p.id);if(d){d.targetProgress=p.progress;d.targetLateral=p.lateral;}if(p.progress>=track.length){p.progress=track.length;p.finished=true;p.finishMs=Date.now()-state.startedAt;state.stage='results';state.finishAt=Date.now();showResults([p]);playTone(900,.35);}}

requestAnimationFrame(()=>{if(socket&&!socket.connected)setStatus('Connect to the race server to play online, or try Practice mode.');});

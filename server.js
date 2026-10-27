const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));

const track = require('./public/track-config.js');
const rooms = new Map();
const MAX_PLAYERS = 8;
const COLORS = ['#f47745','#5ad0e5','#c5ef4a','#a884ff','#ffcf56','#ff6d9b','#72e0a0','#a9d7ff'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const cleanName = name => String(name || '').trim().replace(/[<>]/g, '').slice(0, 16);
function playerView(p) { return { id:p.id,name:p.name,color:p.color,progress:p.progress,lateral:p.lateral,speed:p.speed,nitro:p.nitro,drifting:p.drifting,ready:p.ready,connected:p.connected,paused:p.paused,finished:p.finished,finishMs:p.finishMs }; }
function publicRoom(room) {
  return {code:room.code,hostId:room.host,stage:room.stage,countdownAt:room.countdownAt,startedAt:room.startedAt,finishedAt:room.finishedAt,trackLength:track.length,players:[...room.players.values()].map(playerView)};
}
function broadcast(room) { io.to(room.code).emit('state', publicRoom(room)); }
function newRoom(code) { const room={code,host:null,stage:'lobby',countdownAt:0,startedAt:0,finishedAt:0,players:new Map()};rooms.set(code,room);return room; }
function resetRace(room) { room.stage='lobby';room.countdownAt=0;room.startedAt=0;room.finishedAt=0;for(const p of room.players.values()){p.ready=false;p.progress=0;p.lateral=0;p.speed=0;p.nitro=100;p.drifting=false;p.paused=false;p.finished=false;p.finishMs=null;p.input={};} }

io.on('connection', socket => {
  socket.on('join', ({ code, name, token, color } = {}, reply = () => {}) => {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    name = cleanName(name);
    if (!code || !name) return reply({ error: 'రూమ్ కోడ్, పేరు ఇవ్వండి.' });
    let room = rooms.get(code) || newRoom(code);
    let player = token && room.players.get(token);
    if (player) {
      player.connected = true; player.socketId = socket.id; player.input={};
    } else {
      if (room.stage!=='lobby') return reply({ error: 'రేస్ మొదలైంది. కొత్త ఆటగాళ్లు తదుపరి రేసులో చేరండి.' });
      if (room.players.size >= MAX_PLAYERS) return reply({ error: 'ఈ రూమ్‌లో ఇప్పటికే 8 మంది ఉన్నారు.' });
      if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) return reply({ error: 'ఈ పేరు ఇప్పటికే ఉంది. వేరే పేరు ఎంచుకోండి.' });
      const id = Math.random().toString(36).slice(2, 12);
      player = {id,name,color:COLORS[(room.players.size)%COLORS.length],progress:0,lateral:0,speed:0,nitro:100,drifting:false,ready:false,connected:true,paused:false,finished:false,finishMs:null,socketId:socket.id,input:{}};
      room.players.set(id, player);
      if (!room.host) room.host = id;
    }
    socket.join(code); socket.data.room = code; socket.data.player = player.id;
    reply({ok:true,token:player.id,isHost:room.host===player.id,state:publicRoom(room)});
    broadcast(room);
  });

  socket.on('chooseCar', color => {
    const room=rooms.get(socket.data.room),p=room?.players.get(socket.data.player);if(!p||room.stage!=='lobby')return;
    if(COLORS.includes(color))p.color=color;broadcast(room);
  });
  socket.on('ready', ready => {
    const room=rooms.get(socket.data.room),p=room?.players.get(socket.data.player);if(!p||room.stage!=='lobby')return;
    p.ready=!!ready;broadcast(room);
  });
  socket.on('pauseRace', paused => {
    const room=rooms.get(socket.data.room),p=room?.players.get(socket.data.player);if(!p||room.stage!=='race')return;
    p.paused=!!paused;p.input={};broadcast(room);
  });
  socket.on('input', input => {
    const room = rooms.get(socket.data.room); const player = room?.players.get(socket.data.player);
    if (!player || room.stage!=='race' || player.finished) return;
    player.input={accelerate:!!input?.accelerate,brake:!!input?.brake,left:!!input?.left,right:!!input?.right,drift:!!input?.drift,nitro:!!input?.nitro,reset:!!input?.reset};
  });
  socket.on('startRace', () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.host!==socket.data.player || room.stage!=='lobby' || room.players.size<1) return;
    if ([...room.players.values()].some(p=>p.connected&&!p.ready)) return socket.emit('notice','ప్రతి ఆటగాడు ముందుగా Ready నొక్కాలి.');
    room.stage='countdown';room.countdownAt=Date.now()+3500;
    for(const p of room.players.values()){p.progress=0;p.lateral=0;p.speed=0;p.nitro=100;p.finished=false;p.finishMs=null;p.input={};}
    broadcast(room);
  });
  socket.on('raceAgain',()=>{
    const room=rooms.get(socket.data.room);if(!room||room.host!==socket.data.player||room.stage!=='results')return;
    resetRace(room);broadcast(room);
  });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room); const p = room?.players.get(socket.data.player);
    if (p) { p.connected=false;p.disconnectedAt=Date.now();p.input={};if(room.host===p.id){room.host=[...room.players.values()].find(x=>x.connected)?.id||room.host;}broadcast(room); }
  });
});

let lastTick=Date.now();
setInterval(() => {
  const now=Date.now(),dt=Math.min(.06,(now-lastTick)/1000);lastTick=now;
  for (const room of rooms.values()) {
    if(room.stage==='countdown'&&now>=room.countdownAt){room.stage='race';room.startedAt=now;broadcast(room);}
    if(room.stage!=='race')continue;
    for (const p of room.players.values()) {
      if(!p.connected||p.paused||p.finished)continue;
      const i=p.input, drifting=(i.drift||(i.accelerate&&(i.left||i.right)))&&(i.left||i.right||i.drift);
      const accelerating=i.accelerate;
      if(accelerating)p.speed+=28*dt;else p.speed-=5*dt;
      if(i.brake)p.speed+=p.speed>0?-55*dt:-18*dt;
      const usingNitro=i.nitro&&p.nitro>0&&p.speed>1;
      if(usingNitro){p.speed+=30*dt;p.nitro=Math.max(0,p.nitro-28*dt);}else p.nitro=Math.min(100,p.nitro+9*dt);
      p.speed=clamp(p.speed,-16,drifting?60:72);
      const turn=(Number(i.right)-Number(i.left));
      const steerRate=(drifting?13:8)*(0.35+Math.min(Math.abs(p.speed)/45,1));
      p.lateral=clamp(p.lateral+turn*steerRate*dt,-8.3,8.3);
      if(i.reset){const loc=track.atDistance(p.progress);p.lateral=0;p.speed=0;p.progress=Math.max(0,p.progress);}
      p.drifting=drifting;
      p.progress=Math.max(0,p.progress+p.speed*dt);
      if(p.progress>=track.length){p.progress=track.length;p.finished=true;p.finishMs=now-room.startedAt;}
    }
    const firstFinish=[...room.players.values()].filter(p=>p.finishMs!==null).map(p=>p.finishMs);
    const afterTimeout=(firstFinish.length&&now-room.startedAt>Math.min(...firstFinish)+45000)||now-room.startedAt>180000;
    if(([...room.players.values()].length&&[...room.players.values()].every(p=>p.finished))||afterTimeout){room.stage='results';room.finishedAt=now;for(const p of room.players.values())p.input={};}
    broadcast(room);
  }
}, 50);

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Racing game ready at http://localhost:${port}`));

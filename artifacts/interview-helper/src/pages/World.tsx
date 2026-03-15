import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { PABLO_PRODUCTS } from '../lib/product-names';

// ── World ─────────────────────────────────────────────────────────────────────
const W = 1600, H = 1200, TILE = 32, SPD = 2.5, PSIZE = 8, RANGE = 55;

const BUILDINGS = [
  { id: 'pablo_store', x: 480, y: 200, w: 120, h: 80,  label: 'PABLO STORE',   bright: true  },
  { id: 'office',      x: 680, y: 180, w: 140, h: 100, label: 'OFFICE TOWER',  bright: true  },
  { id: 'clinic',      x: 260, y: 340, w: 100, h: 70,  label: 'MED CLINIC',    bright: false },
  { id: 'megabank',    x: 460, y: 380, w: 120, h: 80,  label: 'MOGUL BANK',    bright: false },
  { id: 'market',      x: 680, y: 360, w: 110, h: 70,  label: 'BLACK MARKET',  bright: false },
  { id: 'hotel',       x: 880, y: 200, w: 100, h: 120, label: 'HOTEL NEON',    bright: false },
  { id: 'bunker',      x: 300, y: 700, w: 130, h: 80,  label: 'BUNKER-09',     bright: false },
  { id: 'scrap',       x: 580, y: 720, w: 160, h: 70,  label: 'SCRAP YARD',    bright: false },
  { id: 'radio',       x: 820, y: 680, w: 100, h: 90,  label: 'PIRATE RADIO',  bright: false },
];

const NPCS = [
  { name: 'WORKER', x: 560, y: 310, type: 'corp'    },
  { name: 'BROKER', x: 750, y: 290, type: 'corp'    },
  { name: 'UNIT-7', x: 820, y: 340, type: 'android' },
  { name: 'DRIFTER',x: 380, y: 440, type: 'human'   },
  { name: 'GUARD',  x: 500, y: 170, type: 'corp'    },
  { name: 'SCAV',   x: 450, y: 760, type: 'human'   },
  { name: 'MUTANT', x: 700, y: 800, type: 'mutant'  },
];
const NPC_COL: Record<string,string> = { corp:'#00cc33', human:'#009922', android:'#33ffaa', mutant:'#88ff44' };

// Roaming threats — simple, early 90s
interface Threat { x:number; y:number; dx:number; dy:number; type:string; timer:number; }
const makeThreat = (x:number, y:number, t:string): Threat => ({ x,y,dx:0,dy:0,type:t,timer:0 });
const THREATS_INIT: Threat[] = [
  makeThreat(620,500,'GANG'), makeThreat(420,560,'GANG'),
  makeThreat(500,780,'MUTANT'), makeThreat(750,750,'RAIDER'),
];
const THREAT_COL: Record<string,string> = { GANG:'#ff4444', MUTANT:'#aaff44', RAIDER:'#ff8800' };

const CITY_TOP = 407;
const CITY_BOTTOM = 793;

// PABLO store lines
const STORE_LINES = [
  '> PABLO CORP. DEVICE',
  '> The city is burning. The wasteland is worse.',
  '> A PABLO device is the only edge you have.',
  '> Register one and stay connected.',
  '> Press ACTIVATE.',
];

// Office rental tiers
const OFFICE_TIERS = [
  { id:'desk',    label:'HOT DESK',       price:50,   desc:'Open floor. Shared terminal.' },
  { id:'private', label:'PRIVATE OFFICE', price:200,  desc:'Single room. Lock code.' },
  { id:'suite',   label:'TEAM SUITE',     price:500,  desc:'4 desks. Secure entry.' },
  { id:'exec',    label:'EXEC FLOOR',     price:1500, desc:'Full suite. AI concierge.' },
];

// ── Character Select ──────────────────────────────────────────────────────────
type CharClass = 'corporate'|'outlaw'|'replicant';
interface Char { name:string; class:CharClass; sx:number; sy:number; salary:number; }

function CharSelect({ onStart }:{ onStart:(c:Char)=>void }) {
  const [name, setName] = useState('');
  const [cls,  setCls]  = useState<CharClass>('corporate');
  const [tick, setTick] = useState(0);
  useEffect(()=>{ const t=setInterval(()=>setTick(n=>n+1),600); return()=>clearInterval(t); },[]);
  const CLASSES: { id:CharClass; label:string; desc:string; sx:number; sy:number; salary:number }[] = [
    { id:'corporate', label:'CORPORATE', desc:'City dweller. Modest salary. Well connected.', sx:6800, sy:5900, salary:200 },
    { id:'outlaw',    label:'OUTLAW',    desc:'Wasteland born. Tough. Broke. Hunted.',      sx:5600, sy:6200, salary:0   },
    { id:'replicant', label:'REPLICANT', desc:'Android. Balanced. Trusted by nobody.',      sx:6800, sy:5900, salary:50  },
  ];
  const sel = CLASSES.find(c=>c.id===cls)!;
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#030803', fontFamily:"'Share Tech Mono',monospace" }}>
      <div style={{ position:'fixed', inset:0, background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)', pointerEvents:'none', zIndex:99 }} />
      <div style={{ maxWidth:520, width:'100%', padding:'2rem', zIndex:1 }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ fontFamily:"'VT323',monospace", fontSize:'3.5rem', color:'#00ff41', textShadow:'0 0 18px rgba(0,255,65,.5)', letterSpacing:'.15em' }}>SALARYMAN</div>
          <div style={{ fontSize:'.6rem', color:'rgba(0,255,65,.3)', letterSpacing:'.12em', marginTop:'.3rem' }}>SELECT CLASS {tick%2===0?'_':' '}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.6rem', marginBottom:'1.25rem' }}>
          {CLASSES.map(c=>(
            <button key={c.id} onClick={()=>setCls(c.id)} style={{ padding:'.8rem .4rem', border:cls===c.id?'1px solid rgba(0,255,65,.75)':'1px solid rgba(0,255,65,.18)', background:cls===c.id?'rgba(0,255,65,.09)':'transparent', color:cls===c.id?'#00ff41':'rgba(0,255,65,.4)', cursor:'pointer', textAlign:'center' }}>
              <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.2rem', letterSpacing:'.08em', marginBottom:'.25rem' }}>{c.label}</div>
              <div style={{ fontSize:'.55rem', lineHeight:1.5 }}>{c.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:'.55rem', color:'rgba(0,255,65,.3)', letterSpacing:'.12em', marginBottom:'.35rem' }}>NAME</div>
          <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&name.trim()&&onStart({name:name.trim().toUpperCase(),class:cls,...sel})} maxLength={18} placeholder="ENTER NAME..." autoFocus style={{ width:'100%', padding:'.55rem .75rem', background:'rgba(0,12,0,.9)', border:'1px solid rgba(0,255,65,.3)', color:'#00ff41', fontFamily:"'Share Tech Mono',monospace", fontSize:'1rem', letterSpacing:'.1em', outline:'none', caretColor:'#00ff41', boxSizing:'border-box' }} />
        </div>
        <button onClick={()=>name.trim()&&onStart({name:name.trim().toUpperCase(),class:cls,...sel})} disabled={!name.trim()} style={{ width:'100%', padding:'.7rem', background:name.trim()?'rgba(0,255,65,.12)':'transparent', border:name.trim()?'1px solid rgba(0,255,65,.65)':'1px solid rgba(0,255,65,.12)', color:name.trim()?'#00ff41':'rgba(0,255,65,.18)', fontFamily:"'VT323',monospace", fontSize:'1.4rem', letterSpacing:'.2em', cursor:name.trim()?'pointer':'default' }}>
          ENTER THE WORLD {tick%2===0?'▶':'▷'}
        </button>
      </div>
    </div>
  );
}

// ── Chat Message ──────────────────────────────────────────────────────────────
interface ChatMsg { id:number; from:string; text:string; dm?:boolean; }

// ── Password Prompt ───────────────────────────────────────────────────────────
function PwPrompt({ label, onOk, onCancel }:{ label:string; onOk:(pw:string)=>void; onCancel:()=>void }) {
  const [v,setV]=useState('');
  return (
    <div style={{ position:'absolute', inset:0, background:'rgba(0,4,0,.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
      <div style={{ width:320, border:'1px solid rgba(0,255,65,.55)', background:'rgba(0,12,0,.98)', padding:'1.5rem' }}>
        <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.4rem', color:'#00ff41', letterSpacing:'.12em', marginBottom:'.25rem' }}>🔒 {label}</div>
        <div style={{ fontSize:'.55rem', color:'rgba(0,255,65,.35)', letterSpacing:'.08em', marginBottom:'.9rem' }}>SECURITY CODE REQUIRED</div>
        <input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&v.trim()&&onOk(v.trim())} type="password" placeholder="••••••••" autoFocus style={{ width:'100%', padding:'.5rem .65rem', background:'rgba(0,12,0,.9)', border:'1px solid rgba(0,255,65,.3)', color:'#00ff41', fontFamily:"'Share Tech Mono',monospace", fontSize:'1rem', outline:'none', caretColor:'#00ff41', boxSizing:'border-box', marginBottom:'.75rem' }} />
        <div style={{ display:'flex', gap:'.5rem' }}>
          <button onClick={()=>v.trim()&&onOk(v.trim())} style={{ flex:1, padding:'.45rem', background:'rgba(0,255,65,.1)', border:'1px solid rgba(0,255,65,.5)', color:'#00ff41', fontFamily:"'VT323',monospace", fontSize:'1rem', letterSpacing:'.1em', cursor:'pointer' }}>UNLOCK</button>
          <button onClick={onCancel} style={{ padding:'.45rem .8rem', background:'transparent', border:'1px solid rgba(0,255,65,.15)', color:'rgba(0,255,65,.35)', fontFamily:"'VT323',monospace", fontSize:'.9rem', cursor:'pointer' }}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ── Main World ────────────────────────────────────────────────────────────────
let msgSeq = 0;

export default function World() {
  const [,navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef     = useRef<WebSocket|null>(null);
  const animRef   = useRef(0);

  const gs = useRef({
    px: 560, py: 320,
    cam: { x:0, y:0 },
    keys: new Set<string>(),
    frame: 0, blink: 0,
    hp: 100, salary: 500,
    hasDevice: false,
    invincible: 0, flash: 0,
    threats: THREATS_INIT.map(t=>({...t})),
    near: null as string|null,
    myId: '',
    peers: new Map<string,{name:string;x:number;y:number;speaking:boolean}>(),
    speakingSet: new Set<string>(),
    locks: new Map<string,{ownerName:string}>(),
  });

  const [char, setChar] = useState<Char|null>(()=>{
    try{ const s=localStorage.getItem('sm_char'); return s?JSON.parse(s):null; }catch{ return null; }
  });

  // UI
  const [dialog,  setDialog]  = useState<{lines:string[];idx:number;bid:string}|null>(null);
  const [msg,     setMsg]     = useState('PABLO CORP. v1.0 — WASD move · E enter · C chat · V voice · P PABLO device');
  const [near,    setNear]    = useState<string|null>(null);
  const [hp,      setHp]      = useState(100);
  const [salary,  setSalary]  = useState(500);
  const [isDead,  setIsDead]  = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [showOffice,setShowOffice]=useState(false);
  const [rentedOffice,setRentedOffice]=useState<string|null>(()=>localStorage.getItem('sm_office'));
  const [showPablo, setShowPablo] = useState(false);
  const [pabloMsgs, setPabloMsgs] = useState<{role:'user'|'pablo';text:string}[]>([]);
  const [pabloIn,   setPabloIn]   = useState('');
  const [pabloLoad, setPabloLoad] = useState(false);
  const [chatOpen,  setChatOpen]  = useState(false);
  const [chatIn,    setChatIn]    = useState('');
  const [chatMsgs,  setChatMsgs]  = useState<ChatMsg[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<{id:string;name:string;x:number;y:number;speaking:boolean}[]>([]);
  const [dmTarget,  setDmTarget]  = useState<{id:string;name:string}|null>(null);
  const [unread,    setUnread]    = useState(0);
  const [voice,     setVoice]     = useState(false);
  const [speaking,  setSpeaking]  = useState(false);
  const [pwPrompt,  setPwPrompt]  = useState<{bid:string;label:string;mode:'enter'|'set'}|null>(null);
  const [pendingBid,setPendingBid]=useState<string|null>(null);
  const [lockMap,   setLockMap]   = useState<Map<string,{ownerName:string}>>(new Map());
  const localStreamRef = useRef<MediaStream|null>(null);
  const peerConns = useRef<Map<string,RTCPeerConnection>>(new Map());
  const audioCtxRef = useRef<AudioContext|null>(null);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const wsSend = useCallback((m:object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  const connectWS = useCallback((c:Char) => {
    const proto = location.protocol==='https:'?'wss:':'ws:';
    const url = `${proto}//${location.host}/ws?name=${encodeURIComponent(c.name)}&class=${c.class}&x=${c.sx}&y=${c.sy}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {};
    ws.onclose = () => setTimeout(()=>{ if(wsRef.current===ws) connectWS(c); },3000);
    ws.onmessage = (ev) => {
      let m: any; try{ m=JSON.parse(ev.data); }catch{ return; }
      const g = gs.current;
      if (m.type==='welcome') {
        g.myId = m.id;
        if (m.locks) {
          const nl = new Map<string,{ownerName:string}>();
          Object.entries(m.locks).forEach(([bid,v]:any)=>{ nl.set(bid,{ownerName:v.ownerName}); g.locks.set(bid,{ownerName:v.ownerName}); });
          setLockMap(nl);
        }
      } else if (m.type==='player_list') {
        g.peers.clear();
        (m.players as any[]).filter(p=>p.id!==g.myId).forEach(p=>g.peers.set(p.id,p));
        setOnlinePlayers((m.players as any[]).filter(p=>p.id!==g.myId));
      } else if (m.type==='player_move') {
        const p=g.peers.get(m.id); if(p){ p.x=m.x; p.y=m.y; }
      } else if (m.type==='player_speaking') {
        if(m.speaking) g.speakingSet.add(m.id); else g.speakingSet.delete(m.id);
      } else if (m.type==='player_left') {
        g.peers.delete(m.id);
        setOnlinePlayers(prev=>prev.filter(p=>p.id!==m.id));
        setChatMsgs(prev=>[...prev,{id:msgSeq++,from:'SERVER',text:`${m.name} left.`}]);
      } else if (m.type==='chat') {
        setChatMsgs(prev=>[...prev.slice(-99),{id:msgSeq++,from:m.from,text:m.text,dm:m.room==='dm'}]);
        if(!chatOpen) setUnread(n=>n+1);
      } else if (m.type==='building_lock_result') {
        if(m.success&&(m.action==='unlock'||m.action==='open')) {
          g.locks.set(m.buildingId,{ownerName:''}); // mark as we've unlocked it for this session
          setLockMap(prev=>{ const nl=new Map(prev); nl.delete(m.buildingId); return nl; });
          if(pendingBid===m.buildingId){ setPendingBid(null); enterBuilding(m.buildingId); }
        } else if(!m.success) { setMsg(`> ACCESS DENIED — ${m.error}`); }
        if(m.success&&m.action==='set') setMsg('> Security code set.');
        setPwPrompt(null);
      } else if (m.type==='building_lock_status') {
        if(m.locked) {
          g.locks.set(m.buildingId,{ownerName:m.ownerName??''});
          setLockMap(prev=>{ const nl=new Map(prev); nl.set(m.buildingId,{ownerName:m.ownerName??''}); return nl; });
          if(pendingBid===m.buildingId) {
            const b=BUILDINGS.find(b=>b.id===m.buildingId);
            setPwPrompt({bid:m.buildingId,label:b?.label??m.buildingId,mode:'enter'});
          }
        } else {
          g.locks.delete(m.buildingId);
          setLockMap(prev=>{ const nl=new Map(prev); nl.delete(m.buildingId); return nl; });
          if(pendingBid===m.buildingId){ setPendingBid(null); enterBuilding(m.buildingId); }
        }
      } else if (m.type==='building_locked') {
        g.locks.set(m.buildingId,{ownerName:m.ownerName});
        setLockMap(prev=>{ const nl=new Map(prev); nl.set(m.buildingId,{ownerName:m.ownerName}); return nl; });
      } else if (m.type==='building_unlocked') {
        g.locks.delete(m.buildingId);
        setLockMap(prev=>{ const nl=new Map(prev); nl.delete(m.buildingId); return nl; });
      } else if (m.type==='voice_offer')  handleVoiceOffer(m.from,m.sdp);
        else if (m.type==='voice_answer') handleVoiceAnswer(m.from,m.sdp);
        else if (m.type==='voice_ice')    handleVoiceICE(m.from,m.candidate);
        else if (m.type==='voice_peer_joined') initiateVoiceWith(m.id);
    };
  }, [chatOpen, pendingBid]);

  // ── Voice / WebRTC ─────────────────────────────────────────────────────────
  const mkPeer = (peerId:string) => {
    const pc = new RTCPeerConnection({ iceServers:[{urls:'stun:stun.l.google.com:19302'}] });
    peerConns.current.set(peerId, pc);
    localStreamRef.current?.getTracks().forEach(t=>pc.addTrack(t,localStreamRef.current!));
    pc.onicecandidate = e=>{ if(e.candidate) wsSend({type:'voice_ice',to:peerId,candidate:e.candidate}); };
    pc.ontrack = e=>{ const a=new Audio(); a.srcObject=e.streams[0]; a.play().catch(()=>{}); };
    return pc;
  };
  const initiateVoiceWith = async (pid:string) => {
    if(!localStreamRef.current) return;
    const pc=mkPeer(pid); const offer=await pc.createOffer();
    await pc.setLocalDescription(offer); wsSend({type:'voice_offer',to:pid,sdp:offer});
  };
  const handleVoiceOffer = async (fid:string,sdp:RTCSessionDescriptionInit) => {
    if(!localStreamRef.current) return;
    const pc=mkPeer(fid); await pc.setRemoteDescription(sdp);
    const ans=await pc.createAnswer(); await pc.setLocalDescription(ans);
    wsSend({type:'voice_answer',to:fid,sdp:ans});
  };
  const handleVoiceAnswer = async (fid:string,sdp:RTCSessionDescriptionInit) => { await peerConns.current.get(fid)?.setRemoteDescription(sdp); };
  const handleVoiceICE    = async (fid:string,c:RTCIceCandidateInit) => { await peerConns.current.get(fid)?.addIceCandidate(c); };

  const toggleVoice = useCallback(async () => {
    if (voice) {
      localStreamRef.current?.getTracks().forEach(t=>t.stop()); localStreamRef.current=null;
      peerConns.current.forEach(pc=>pc.close()); peerConns.current.clear();
      audioCtxRef.current?.close(); audioCtxRef.current=null;
      setVoice(false); setSpeaking(false); wsSend({type:'speaking',speaking:false});
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
        localStreamRef.current = stream; setVoice(true); wsSend({type:'voice_join'});
        const ctx=new AudioContext(); audioCtxRef.current=ctx;
        const src=ctx.createMediaStreamSource(stream); const an=ctx.createAnalyser();
        an.fftSize=256; src.connect(an); const data=new Uint8Array(an.frequencyBinCount);
        const tick=()=>{ if(!localStreamRef.current)return; an.getByteFrequencyData(data);
          const spk=data.reduce((a,b)=>a+b,0)/data.length>12;
          setSpeaking(spk); wsSend({type:'speaking',speaking:spk}); requestAnimationFrame(tick); };
        tick();
      } catch { setMsg('> Voice — mic access denied.'); }
    }
  }, [voice, wsSend]);

  // ── Building enter ─────────────────────────────────────────────────────────
  const enterBuilding = useCallback((bid:string) => {
    const g = gs.current;
    if (bid==='pablo_store') { setDialog({lines:STORE_LINES,idx:0,bid}); }
    else if (bid==='clinic') {
      if(g.salary>=100){ g.hp=100; g.salary-=100; setHp(100); setSalary(g.salary); setMsg('> MED CLINIC — [ƒ100] Health restored.'); }
      else setMsg('> MED CLINIC — "Come back with ƒ100."');
    }
    else if (bid==='megabank') { setMsg('> MOGUL BANK — Account suspended. Try again never.'); }
    else if (bid==='market')   { g.salary+=30; setSalary(g.salary); setMsg('> BLACK MARKET — Odd job. +ƒ30.'); }
    else if (bid==='office')   { setShowOffice(true); }
    else if (bid==='hotel')    { g.hp=Math.min(100,g.hp+40); setHp(g.hp); setMsg('> HOTEL NEON — You rest. HP +40.'); }
    else if (bid==='bunker')   { setMsg('> BUNKER-09 — "We don\'t let strangers in. Move on."'); }
    else if (bid==='radio')    { setMsg('> PIRATE RADIO — Static and broken promises. Someone is broadcasting.'); }
    else if (bid==='scrap')    { g.salary+=20; setSalary(g.salary); setMsg('> SCRAP YARD — Sold some junk. +ƒ20.'); }
    else setMsg(`> Locked.`);
  }, []);

  const tryEnter = useCallback((bid:string) => {
    const lock = gs.current.locks.get(bid);
    if (lock !== undefined) {
      if (!lock.ownerName) { enterBuilding(bid); return; } // we already unlocked it
      const b=BUILDINGS.find(b=>b.id===bid);
      setPendingBid(bid); setPwPrompt({bid,label:b?.label??bid,mode:'enter'});
    } else {
      setPendingBid(bid); wsSend({type:'building_lock_query',buildingId:bid});
    }
  }, [enterBuilding, wsSend]);

  // Dialog advance
  const advDialog = useCallback(()=>{
    if(!dialog) return;
    if(dialog.idx<dialog.lines.length-1){ setDialog(d=>d?{...d,idx:d.idx+1}:null); }
    else { if(dialog.bid==='pablo_store'){ gs.current.hasDevice=true; setShowStore(true); } setDialog(null); }
  },[dialog]);

  // Chat send
  const sendChat = useCallback(()=>{
    if(!chatIn.trim()) return;
    const text=chatIn.trim(); setChatIn('');
    if(dmTarget) wsSend({type:'chat',room:'dm',text,toId:dmTarget.id});
    else wsSend({type:'chat',room:'world',text});
  },[chatIn,dmTarget,wsSend]);

  // PABLO AI
  const sendPablo = useCallback(async ()=>{
    if(!pabloIn.trim()||pabloLoad) return;
    const txt=pabloIn.trim(); setPabloIn('');
    setPabloMsgs(m=>[...m,{role:'user',text:txt}]);
    if(!gs.current.hasDevice){ setPabloMsgs(m=>[...m,{role:'pablo',text:'> Device not activated. Visit the PABLO STORE.'}]); return; }
    setPabloLoad(true);
    try {
      const r=await fetch('/api/advisor/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:txt,context:`You are PABLO, a gritty in-world AI. The user is ${char?.name}, a ${char?.class}. Be brief.`}),credentials:'include'});
      const d=r.ok?await r.json():{};
      setPabloMsgs(m=>[...m,{role:'pablo',text:d.response??'> Signal lost.'}]);
    } catch { setPabloMsgs(m=>[...m,{role:'pablo',text:'> Network dead.'}]); }
    setPabloLoad(false);
  },[pabloIn,pabloLoad,char]);

  // Start
  const handleStart = useCallback((c:Char)=>{
    localStorage.setItem('sm_char',JSON.stringify(c));
    gs.current.px=c.sx; gs.current.py=c.sy; gs.current.salary=c.salary;
    setSalary(c.salary); setChar(c);
    setTimeout(()=>setMsg(`> ${c.name} [${c.class.toUpperCase()}] — Find the PABLO STORE. Press [E] near buildings.`),300);
  },[]);

  // WS connect
  useEffect(()=>{ if(!char) return; connectWS(char); return()=>{ wsRef.current?.close(); wsRef.current=null; }; },[char?.name]);

  // Broadcast position
  useEffect(()=>{
    if(!char) return;
    const id=setInterval(()=>{ const g=gs.current; wsSend({type:'move',x:g.px,y:g.py}); },120);
    return()=>clearInterval(id);
  },[char,wsSend]);

  // Keys
  useEffect(()=>{
    if(!char) return;
    const dn=(e:KeyboardEvent)=>{
      const tag=(e.target as HTMLElement).tagName;
      if(tag==='INPUT'||tag==='TEXTAREA') return;
      gs.current.keys.add(e.key.toLowerCase());
      if(e.key==='e'||e.key==='E'){ const nb=gs.current.near; if(nb&&!dialog&&!showStore&&!showOffice&&!showPablo&&!pwPrompt) tryEnter(nb); }
      if(e.key==='p'||e.key==='P') setShowPablo(v=>!v);
      if(e.key==='c'||e.key==='C'){ setChatOpen(v=>!v); setUnread(0); }
      if(e.key==='v'||e.key==='V') toggleVoice();
      if(e.key===' '||e.key==='Enter') { if(dialog){ e.preventDefault(); advDialog(); } }
      if(e.key==='Escape'){ setDialog(null); setShowStore(false); setShowOffice(false); setShowPablo(false); setPwPrompt(null); setPendingBid(null); }
    };
    const up=(e:KeyboardEvent)=>gs.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown',dn); window.addEventListener('keyup',up);
    return()=>{ window.removeEventListener('keydown',dn); window.removeEventListener('keyup',up); };
  },[char,dialog,showStore,showOffice,showPablo,pwPrompt,tryEnter,advDialog,toggleVoice]);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!char) return;
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d')!;
    const resize=()=>{ canvas.width=canvas.offsetWidth; canvas.height=canvas.offsetHeight; };
    resize(); window.addEventListener('resize',resize);
    let lastNear:string|null=null, lastHp=100, lastSal=500, lastDead=false;
    const frozen=()=>!!dialog||showStore||showOffice||showPablo||!!pwPrompt||isDead;

    const loop=()=>{
      const g=gs.current;
      g.frame++; g.blink=Math.floor(g.frame/25)%2;
      if(g.invincible>0) g.invincible--;
      if(g.flash>0) g.flash--;

      // Movement
      if(!frozen()){
        let dx=0,dy=0;
        if(g.keys.has('arrowleft') ||g.keys.has('a')) dx-=SPD;
        if(g.keys.has('arrowright')||g.keys.has('d')) dx+=SPD;
        if(g.keys.has('arrowup')   ||g.keys.has('w')) dy-=SPD;
        if(g.keys.has('arrowdown') ||g.keys.has('s')) dy+=SPD;
        if(dx&&dy){ dx*=0.707; dy*=0.707; }
        const col=(px:number,py:number)=>BUILDINGS.some(b=>px+PSIZE>b.x&&px-PSIZE<b.x+b.w&&py+PSIZE>b.y&&py-PSIZE<b.y+b.h);
        let nx=g.px+dx, ny=g.py+dy;
        if(col(nx,g.py)) nx=g.px;
        if(col(g.px,ny)) ny=g.py;
        g.px=Math.max(PSIZE,Math.min(W-PSIZE,nx));
        g.py=Math.max(PSIZE,Math.min(H-PSIZE,ny));
      }

      // Threats
      for(const t of g.threats){
        t.timer--;
        const dist=Math.hypot(g.px-t.x,g.py-t.y);
        if(dist<120){ // chase
          const ang=Math.atan2(g.py-t.y,g.px-t.x);
          t.dx=Math.cos(ang)*1.1; t.dy=Math.sin(ang)*1.1;
        } else if(t.timer<=0){ // patrol
          const ang=Math.random()*Math.PI*2;
          t.dx=Math.cos(ang)*0.6; t.dy=Math.sin(ang)*0.6; t.timer=80+Math.floor(Math.random()*80);
        }
        t.x=Math.max(10,Math.min(W-10,t.x+t.dx));
        t.y=Math.max(10,Math.min(H-10,t.y+t.dy));
        if(dist<14&&g.invincible===0){ g.hp=Math.max(0,g.hp-0.4); g.invincible=20; g.flash=6; }
      }

      if(g.hp<=0&&!lastDead){ lastDead=true; setIsDead(true); }

      // Camera
      const cw=canvas.width, ch=canvas.height;
      g.cam.x=Math.max(0,Math.min(W-cw,g.px-cw/2));
      g.cam.y=Math.max(0,Math.min(H-ch,g.py-ch/2));
      const ox=-g.cam.x, oy=-g.cam.y;

      // Proximity
      let nb:string|null=null;
      for(const b of BUILDINGS){
        if(Math.hypot(g.px-(b.x+b.w/2),g.py-(b.y+b.h/2))<RANGE){ nb=b.id; break; }
      }
      g.near=nb;
      if(nb!==lastNear){ lastNear=nb; setNear(nb);
        if(nb&&!frozen()){ const b=BUILDINGS.find(b=>b.id===nb); const lk=g.locks.get(nb); setMsg(`> ${b?.label}${lk?` [LOCKED by ${lk.ownerName}]`:''} — [E] enter`); }
      }

      if(g.hp!==lastHp){ lastHp=g.hp; setHp(g.hp); }
      if(g.salary!==lastSal){ lastSal=g.salary; setSalary(g.salary); }

      // ── DRAW ─────────────────────────────────────────────────────────────
      if(g.flash>0){ ctx.fillStyle=`rgba(255,0,0,${g.flash*.05})`; ctx.fillRect(0,0,cw,ch); }
      ctx.fillStyle='#030803'; ctx.fillRect(0,0,cw,ch);

      // Grid
      ctx.strokeStyle='rgba(0,255,65,.04)'; ctx.lineWidth=1;
      const sgx=Math.floor(g.cam.x/TILE)*TILE, sgy=Math.floor(g.cam.y/TILE)*TILE;
      for(let gx=sgx;gx<g.cam.x+cw+TILE;gx+=TILE){ ctx.beginPath();ctx.moveTo(gx+ox,0);ctx.lineTo(gx+ox,ch);ctx.stroke(); }
      for(let gy=sgy;gy<g.cam.y+ch+TILE;gy+=TILE){ ctx.beginPath();ctx.moveTo(0,gy+oy);ctx.lineTo(cw,gy+oy);ctx.stroke(); }

      // Zone splits (city top & bottom borders)
      const cityTopY2=CITY_TOP+oy; const cityBotY2=CITY_BOTTOM+oy;
      ctx.strokeStyle='rgba(0,255,65,.12)'; ctx.setLineDash([6,4]); ctx.lineWidth=1;
      if(cityTopY2>0&&cityTopY2<ch){ ctx.beginPath();ctx.moveTo(0,cityTopY2);ctx.lineTo(cw,cityTopY2);ctx.stroke(); }
      if(cityBotY2>0&&cityBotY2<ch){ ctx.beginPath();ctx.moveTo(0,cityBotY2);ctx.lineTo(cw,cityBotY2);ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(0,255,65,.025)';ctx.font='60px "VT323"';ctx.textAlign='center';
      ctx.fillText((g.py>=CITY_TOP&&g.py<=CITY_BOTTOM)?'CITY':'WASTELAND',cw/2,ch/2);

      // Roads
      ctx.lineWidth=18;ctx.strokeStyle='rgba(0,255,65,.06)';
      ctx.beginPath();ctx.moveTo(0,500+oy);ctx.lineTo(W+ox,500+oy);ctx.stroke();
      ctx.beginPath();ctx.moveTo(650+ox,0);ctx.lineTo(650+ox,H+oy);ctx.stroke();

      // Buildings
      for(const b of BUILDINGS){
        const bx=b.x+ox,by=b.y+oy;
        if(bx+b.w<0||bx>cw||by+b.h<0||by>ch) continue;
        const isNear=nb===b.id;
        const isLocked=g.locks.has(b.id)&&!!g.locks.get(b.id)?.ownerName;
        ctx.strokeStyle=isLocked?`rgba(255,120,50,${isNear?.8:.3})`:b.bright?`rgba(0,255,65,${isNear?.9:.5})` :`rgba(0,180,50,${isNear?.7:.3})`;
        ctx.lineWidth=isNear?2:1; ctx.strokeRect(bx,by,b.w,b.h);
        ctx.fillStyle=isLocked?'rgba(255,80,0,.04)':'rgba(0,255,65,.03)'; ctx.fillRect(bx,by,b.w,b.h);
        // corners
        const cs=7;ctx.lineWidth=1.5;ctx.strokeStyle=isLocked?'rgba(255,120,50,.55)':b.bright?'rgba(0,255,65,.75)':'rgba(0,200,50,.4)';
        [[bx,by,1,1],[bx+b.w,by,-1,1],[bx,by+b.h,1,-1],[bx+b.w,by+b.h,-1,-1]].forEach(([cx2,cy2,sx,sy])=>{
          ctx.beginPath();ctx.moveTo(cx2,cy2+sy*cs);ctx.lineTo(cx2,cy2);ctx.lineTo(cx2+sx*cs,cy2);ctx.stroke();
        });
        ctx.fillStyle=isLocked?'rgba(255,140,60,.7)':b.bright?(isNear?'#00ff41':'rgba(0,255,65,.6)'):'rgba(0,200,50,.45)';
        ctx.font=`${b.bright?10:9}px "Share Tech Mono"`;ctx.textAlign='center';
        ctx.fillText(b.label+(isLocked?' 🔒':''),bx+b.w/2,by+b.h/2+4);
        if(isNear){ctx.fillStyle=g.blink?'rgba(0,255,65,.85)':'rgba(0,255,65,.35)';ctx.font='8px "Share Tech Mono"';ctx.fillText('[E]',bx+b.w/2,by-7);}
      }

      // NPCs
      for(const n of NPCS){
        const nx2=n.x+ox,ny2=n.y+oy;
        if(nx2<-10||nx2>cw+10||ny2<-10||ny2>ch+10) continue;
        ctx.fillStyle=NPC_COL[n.type]??'#009922';ctx.fillRect(nx2-3,ny2-3,6,6);
        if(Math.hypot(g.px-n.x,g.py-n.y)<70){ctx.fillStyle='rgba(0,255,65,.4)';ctx.font='7px "Share Tech Mono"';ctx.textAlign='center';ctx.fillText(n.name,nx2,ny2-8);}
      }

      // Online players (real)
      for(const [,op] of g.peers){
        const px2=op.x+ox,py2=op.y+oy;
        if(px2<-20||px2>cw+20||py2<-20||py2>ch+20) continue;
        const spk=g.speakingSet.has(op.id);
        if(spk){ctx.shadowColor='rgba(0,255,180,.6)';ctx.shadowBlur=12;}
        ctx.fillStyle=spk?'#00ffcc':'#44aaff';
        ctx.beginPath();ctx.moveTo(px2,py2-9);ctx.lineTo(px2+6,py2+5);ctx.lineTo(px2-6,py2+5);ctx.closePath();ctx.fill();
        ctx.shadowBlur=0;
        ctx.fillStyle=spk?'#00ffcc':'rgba(100,180,255,.65)';ctx.font='bold 8px "Share Tech Mono"';ctx.textAlign='center';
        ctx.fillText(op.name,px2,py2-12);
      }

      // Threats
      for(const t of g.threats){
        const tx=t.x+ox,ty=t.y+oy;
        if(tx<-10||tx>cw+10||ty<-10||ty>ch+10) continue;
        const tc=THREAT_COL[t.type]??'#ff4444';
        const chasing=Math.hypot(g.px-t.x,g.py-t.y)<120;
        ctx.shadowColor=tc;ctx.shadowBlur=chasing?8:3;
        ctx.fillStyle=chasing?tc:`${tc}77`;ctx.fillRect(tx-4,ty-4,8,8);
        ctx.shadowBlur=0;
        if(chasing){ctx.fillStyle=tc;ctx.font='7px "Share Tech Mono"';ctx.textAlign='center';ctx.fillText(t.type,tx,ty-8);}
      }

      // Player
      const px=g.px+ox,py=g.py+oy;
      const pcol=g.invincible%4<2?'#00ff41':'rgba(0,255,65,.25)';
      ctx.shadowColor='#00ff41';ctx.shadowBlur=10;
      ctx.fillStyle=pcol;
      ctx.beginPath();ctx.moveTo(px,py-PSIZE);ctx.lineTo(px+PSIZE*.65,py+PSIZE*.5);ctx.lineTo(px-PSIZE*.65,py+PSIZE*.5);ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;
      if(speaking){ctx.strokeStyle='rgba(0,255,180,.6)';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(px,py,14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      ctx.fillStyle='rgba(0,255,65,.65)';ctx.font='bold 8px "Share Tech Mono"';ctx.textAlign='center';
      ctx.fillText(char.name,px,py-PSIZE-5);

      // Mini-map
      const mmW=100,mmH=70,mmX=cw-mmW-10,mmY=42;
      ctx.fillStyle='rgba(0,6,0,.88)';ctx.fillRect(mmX,mmY,mmW,mmH);
      ctx.strokeStyle='rgba(0,255,65,.25)';ctx.lineWidth=1;ctx.strokeRect(mmX,mmY,mmW,mmH);
      ctx.fillStyle='rgba(0,255,65,.18)';ctx.font='6px "Share Tech Mono"';ctx.textAlign='left';
      ctx.fillText(`MAP  ${g.peers.size+1}P`,mmX+3,mmY+9);
      const mwTop=mmY+(CITY_TOP/H)*mmH; const mwBot=mmY+(CITY_BOTTOM/H)*mmH;
      ctx.strokeStyle='rgba(0,255,65,.18)';ctx.setLineDash([2,2]);
      ctx.beginPath();ctx.moveTo(mmX,mwTop);ctx.lineTo(mmX+mmW,mwTop);ctx.stroke();
      ctx.beginPath();ctx.moveTo(mmX,mwBot);ctx.lineTo(mmX+mmW,mwBot);ctx.stroke();ctx.setLineDash([]);
      for(const b of BUILDINGS){
        const bIsLocked=g.locks.has(b.id)&&!!g.locks.get(b.id)?.ownerName;
        ctx.fillStyle=bIsLocked?'rgba(255,120,50,.5)':b.bright?'rgba(0,255,65,.7)':'rgba(0,160,50,.35)';
        ctx.fillRect(mmX+(b.x/W)*mmW,mmY+(b.y/H)*mmH,Math.max(2,(b.w/W)*mmW),Math.max(1,(b.h/H)*mmH));
      }
      for(const t of g.threats){ctx.fillStyle=THREAT_COL[t.type];ctx.fillRect(mmX+(t.x/W)*mmW-1,mmY+(t.y/H)*mmH-1,2,2);}
      for(const [,op] of g.peers){ctx.fillStyle='#44aaff';ctx.fillRect(mmX+(op.x/W)*mmW-1,mmY+(op.y/H)*mmH-1,2,2);}
      ctx.fillStyle='#00ff41';ctx.shadowColor='#00ff41';ctx.shadowBlur=3;
      ctx.fillRect(mmX+(g.px/W)*mmW-2,mmY+(g.py/H)*mmH-2,4,4);ctx.shadowBlur=0;

      animRef.current=requestAnimationFrame(loop);
    };
    animRef.current=requestAnimationFrame(loop);
    return()=>{ cancelAnimationFrame(animRef.current); window.removeEventListener('resize',resize); };
  },[char,dialog,showStore,showOffice,showPablo,pwPrompt,isDead,speaking]);

  if(!char) return <CharSelect onStart={handleStart} />;

  return (
    <div style={{ width:'100vw',height:'100vh',overflow:'hidden',background:'#030803',position:'relative',fontFamily:"'Share Tech Mono',monospace" }}>
      {/* Scanlines */}
      <div style={{ position:'fixed',inset:0,background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.14) 2px,rgba(0,0,0,.14) 4px)',pointerEvents:'none',zIndex:9999 }} />
      <canvas ref={canvasRef} style={{ width:'100%',height:'100%',display:'block' }} />

      {/* TOP BAR */}
      <div style={{ position:'absolute',top:0,left:0,right:0,padding:'.3rem .9rem',background:'rgba(0,6,0,.92)',borderBottom:'1px solid rgba(0,255,65,.15)',display:'flex',alignItems:'center',justifyContent:'space-between',zIndex:100 }}>
        <div style={{ display:'flex',alignItems:'center',gap:'1.25rem' }}>
          <span style={{ fontFamily:"'VT323',monospace",fontSize:'1.3rem',color:'#00ff41',textShadow:'0 0 10px rgba(0,255,65,.5)',letterSpacing:'.12em' }}>SALARYMAN</span>
          <span style={{ fontSize:'.55rem',color:'rgba(0,255,65,.4)',letterSpacing:'.07em' }}>{char.name} · {char.class.toUpperCase()}</span>
          {gs.current.hasDevice&&<span style={{ fontSize:'.5rem',color:'rgba(0,255,65,.55)',border:'1px solid rgba(0,255,65,.25)',padding:'1px 5px' }}>PABLO ✓</span>}
          <span style={{ fontSize:'.5rem',color:'rgba(100,180,255,.5)',border:'1px solid rgba(100,180,255,.2)',padding:'1px 5px' }}>{onlinePlayers.length+1} ONLINE</span>
        </div>
        <div style={{ display:'flex',gap:'.75rem',alignItems:'center' }}>
          <span style={{ fontSize:'.48rem',color:'rgba(0,255,65,.2)',letterSpacing:'.06em' }}>WASD · E · C · V · P · ESC</span>
          <button onClick={()=>{localStorage.removeItem('sm_char');setChar(null);gs.current.threats=THREATS_INIT.map(t=>({...t}));setIsDead(false);}} style={{ fontSize:'.48rem',color:'rgba(0,255,65,.28)',border:'1px solid rgba(0,255,65,.12)',background:'transparent',padding:'2px 7px',cursor:'pointer' }}>NEW GAME</button>
          <button onClick={()=>navigate('/')} style={{ fontSize:'.48rem',color:'rgba(0,255,65,.28)',border:'1px solid rgba(0,255,65,.12)',background:'transparent',padding:'2px 7px',cursor:'pointer' }}>← EXIT</button>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{ position:'absolute',bottom:0,left:0,right:0,padding:'.45rem .9rem',background:'rgba(0,6,0,.9)',borderTop:'1px solid rgba(0,255,65,.15)',display:'flex',alignItems:'center',gap:'1rem',zIndex:100 }}>
        {/* HP bar */}
        <div style={{ flexShrink:0 }}>
          <div style={{ fontSize:'.48rem',color:'rgba(0,255,65,.35)',letterSpacing:'.1em',marginBottom:'2px' }}>HP</div>
          <div style={{ width:80,height:6,background:'rgba(0,255,65,.1)',position:'relative' }}>
            <div style={{ position:'absolute',top:0,left:0,height:'100%',width:`${hp}%`,background:'#00ff41',boxShadow:'0 0 4px rgba(0,255,65,.6)',transition:'width .2s' }} />
          </div>
        </div>
        {/* Salary */}
        <div style={{ flexShrink:0,borderLeft:'1px solid rgba(0,255,65,.12)',paddingLeft:'.75rem' }}>
          <div style={{ fontFamily:"'VT323',monospace",fontSize:'1.3rem',color:'#00ff41',textShadow:'0 0 6px rgba(0,255,65,.35)',letterSpacing:'.08em' }}>ƒ{salary}</div>
        </div>
        {/* Narration */}
        <div style={{ flex:1,fontSize:'.65rem',color:'rgba(0,255,65,.6)',letterSpacing:'.04em',lineHeight:1.5,borderLeft:'1px solid rgba(0,255,65,.1)',paddingLeft:'.75rem' }}>{msg}</div>
        {/* Buttons */}
        <div style={{ display:'flex',gap:'.5rem',flexShrink:0 }}>
          <button onClick={toggleVoice} title="Voice [V]" style={{ padding:'.3rem .55rem',background:voice?'rgba(0,255,65,.1)':'rgba(0,255,65,.03)',border:voice?`1px solid ${speaking?'rgba(0,255,180,.7)':'rgba(0,255,65,.45)'}`:'1px solid rgba(0,255,65,.12)',color:voice?(speaking?'#00ffcc':'#00ff41'):'rgba(0,255,65,.28)',cursor:'pointer',fontSize:'.6rem',letterSpacing:'.06em' }}>
            {voice?(speaking?'●MIC':'○MIC'):'MIC'}
          </button>
          <button onClick={()=>{setChatOpen(v=>!v);setUnread(0);}} title="Chat [C]" style={{ padding:'.3rem .55rem',background:chatOpen?'rgba(0,255,65,.1)':'rgba(0,255,65,.03)',border:chatOpen?'1px solid rgba(0,255,65,.45)':'1px solid rgba(0,255,65,.12)',color:chatOpen?'#00ff41':'rgba(0,255,65,.28)',cursor:'pointer',fontSize:'.6rem',letterSpacing:'.06em',position:'relative' }}>
            CHAT{unread>0?` (${unread})`:''}
          </button>
          <button onClick={()=>setShowPablo(v=>!v)} title="PABLO [P]" style={{ padding:'.3rem .55rem',background:showPablo?'rgba(0,255,65,.1)':'rgba(0,255,65,.03)',border:showPablo?'1px solid rgba(0,255,65,.45)':'1px solid rgba(0,255,65,.12)',color:showPablo?'#00ff41':'rgba(0,255,65,.28)',cursor:'pointer',fontSize:'.6rem',letterSpacing:'.06em' }}>
            PABLO
          </button>
        </div>
      </div>

      {/* CHAT PANEL */}
      {chatOpen&&(
        <div style={{ position:'absolute',bottom:'3.5rem',left:'.75rem',width:300,maxHeight:'45vh',background:'rgba(0,6,0,.97)',border:'1px solid rgba(0,255,65,.35)',display:'flex',flexDirection:'column',zIndex:200 }}>
          <div style={{ padding:'.4rem .6rem',borderBottom:'1px solid rgba(0,255,65,.18)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <span style={{ fontFamily:"'VT323',monospace",fontSize:'.9rem',color:'#00ff41',letterSpacing:'.1em' }}>WORLD CHAT</span>
            <div style={{ display:'flex',gap:'.4rem',alignItems:'center' }}>
              {dmTarget&&<button onClick={()=>setDmTarget(null)} style={{ fontSize:'.5rem',color:'rgba(0,255,65,.4)',border:'none',background:'transparent',cursor:'pointer' }}>× DM off</button>}
              <button onClick={()=>setChatOpen(false)} style={{ fontSize:'.5rem',color:'rgba(0,255,65,.35)',border:'none',background:'transparent',cursor:'pointer' }}>×</button>
            </div>
          </div>
          {onlinePlayers.length>0&&(
            <div style={{ padding:'.3rem .5rem',borderBottom:'1px solid rgba(0,255,65,.12)',display:'flex',gap:'.35rem',flexWrap:'wrap' }}>
              {onlinePlayers.map(p=>(
                <button key={p.id} onClick={()=>setDmTarget(dmTarget?.id===p.id?null:{id:p.id,name:p.name})} style={{ fontSize:'.52rem',padding:'1px 5px',background:dmTarget?.id===p.id?'rgba(0,255,65,.12)':'transparent',border:dmTarget?.id===p.id?'1px solid rgba(0,255,65,.4)':'1px solid rgba(0,255,65,.18)',color:dmTarget?.id===p.id?'#00ff41':'rgba(0,255,65,.4)',cursor:'pointer',fontFamily:"'Share Tech Mono',monospace" }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex:1,overflowY:'auto',padding:'.5rem',display:'flex',flexDirection:'column',gap:'.25rem',minHeight:60 }}>
            {chatMsgs.length===0
              ?<div style={{ fontSize:'.58rem',color:'rgba(0,255,65,.2)' }}>Say something.</div>
              :chatMsgs.slice(-40).map(m=>(
                <div key={m.id} style={{ fontSize:'.65rem',lineHeight:1.5,color:m.from==='SERVER'?'rgba(0,255,65,.3)':m.dm?'rgba(100,200,255,.8)':'rgba(0,255,65,.7)' }}>
                  <span style={{ color:'rgba(0,255,65,.4)',fontFamily:"'VT323',monospace",fontSize:'.75rem' }}>{m.dm?'[DM]':''}{m.from.slice(0,12)}</span>{' '}{m.text}
                </div>
              ))
            }
          </div>
          <div style={{ padding:'.35rem',borderTop:'1px solid rgba(0,255,65,.15)',display:'flex',gap:'.35rem' }}>
            {dmTarget&&<span style={{ fontSize:'.5rem',color:'rgba(100,200,255,.5)',alignSelf:'center',flexShrink:0 }}>→{dmTarget.name.slice(0,8)}</span>}
            <input value={chatIn} onChange={e=>setChatIn(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder={dmTarget?`DM ${dmTarget.name}...`:"World..."} style={{ flex:1,background:'rgba(0,12,0,.9)',border:'1px solid rgba(0,255,65,.18)',color:'#00ff41',fontFamily:"'Share Tech Mono',monospace",fontSize:'.65rem',padding:'.28rem .45rem',outline:'none',caretColor:'#00ff41' }} />
            <button onClick={sendChat} style={{ background:'rgba(0,255,65,.08)',border:'1px solid rgba(0,255,65,.3)',color:'#00ff41',cursor:'pointer',padding:'0 .45rem',fontSize:'.65rem' }}>↵</button>
          </div>
        </div>
      )}

      {/* PABLO PANEL */}
      {showPablo&&(
        <div style={{ position:'absolute',bottom:'3.5rem',right:'.75rem',width:320,maxHeight:'52vh',background:'rgba(0,6,0,.97)',border:'1px solid rgba(0,255,65,.4)',display:'flex',flexDirection:'column',zIndex:200 }}>
          <div style={{ padding:'.5rem .75rem',borderBottom:'1px solid rgba(0,255,65,.18)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <div>
              <div style={{ fontFamily:"'VT323',monospace",fontSize:'1.1rem',color:'#00ff41',letterSpacing:'.12em' }}>PABLO DEVICE</div>
              <div style={{ fontSize:'.5rem',color:'rgba(0,255,65,.3)',letterSpacing:'.07em' }}>{gs.current.hasDevice?'ACTIVE':'NOT REGISTERED'}</div>
            </div>
            <button onClick={()=>setShowPablo(false)} style={{ background:'transparent',border:'none',color:'rgba(0,255,65,.4)',cursor:'pointer',fontSize:'.8rem' }}>×</button>
          </div>
          {!gs.current.hasDevice?(
            <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',textAlign:'center' }}>
              <div>
                <div style={{ fontFamily:"'VT323',monospace",fontSize:'1.2rem',color:'rgba(0,255,65,.4)',letterSpacing:'.1em',marginBottom:'.4rem' }}>LOCKED</div>
                <div style={{ fontSize:'.6rem',color:'rgba(0,255,65,.3)',lineHeight:1.7 }}>Visit <span style={{ color:'#00ff41' }}>PABLO STORE</span> to activate.</div>
              </div>
            </div>
          ):(
            <>
              <div style={{ flex:1,overflowY:'auto',padding:'.6rem',display:'flex',flexDirection:'column',gap:'.4rem',minHeight:80 }}>
                {pabloMsgs.length===0&&<div style={{ fontSize:'.6rem',color:'rgba(0,255,65,.25)',lineHeight:1.7 }}>&gt; PABLO ONLINE<br/>&gt; Ask anything.</div>}
                {pabloMsgs.map((m,i)=>(
                  <div key={i} style={{ fontSize:'.65rem',lineHeight:1.5,color:m.role==='user'?'rgba(0,255,65,.55)':'#00ff41',paddingLeft:m.role==='pablo'?'.4rem':0,borderLeft:m.role==='pablo'?'2px solid rgba(0,255,65,.25)':'none' }}>
                    <span style={{ color:'rgba(0,255,65,.35)',fontFamily:"'VT323',monospace",fontSize:'.75rem',marginRight:'.3rem' }}>{m.role==='user'?`[${char.name.slice(0,8)}]`:'[PABLO]'}</span>{m.text}
                  </div>
                ))}
                {pabloLoad&&<div style={{ fontSize:'.6rem',color:'rgba(0,255,65,.35)',fontFamily:"'VT323',monospace" }}>...</div>}
              </div>
              <div style={{ padding:'.4rem',borderTop:'1px solid rgba(0,255,65,.15)',display:'flex',gap:'.35rem' }}>
                <input value={pabloIn} onChange={e=>setPabloIn(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendPablo()} placeholder="Ask PABLO..." style={{ flex:1,background:'rgba(0,12,0,.9)',border:'1px solid rgba(0,255,65,.2)',color:'#00ff41',fontFamily:"'Share Tech Mono',monospace",fontSize:'.65rem',padding:'.28rem .45rem',outline:'none',caretColor:'#00ff41' }} />
                <button onClick={sendPablo} style={{ background:'rgba(0,255,65,.1)',border:'1px solid rgba(0,255,65,.35)',color:'#00ff41',cursor:'pointer',padding:'0 .45rem',fontSize:'.65rem' }}>↵</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* DIALOG */}
      {dialog&&(
        <div style={{ position:'absolute',bottom:'4rem',left:'50%',transform:'translateX(-50%)',width:520,maxWidth:'90vw',background:'rgba(0,8,0,.97)',border:'1px solid rgba(0,255,65,.5)',padding:'1rem',zIndex:200,cursor:'pointer' }} onClick={advDialog}>
          <div style={{ fontSize:'.5rem',color:'rgba(0,255,65,.35)',letterSpacing:'.1em',marginBottom:'.4rem' }}>PABLO CORP.</div>
          <div style={{ fontSize:'.8rem',color:'#00ff41',lineHeight:1.7,letterSpacing:'.03em',minHeight:'2rem' }}>{dialog.lines[dialog.idx]}</div>
          <div style={{ marginTop:'.5rem',textAlign:'right',fontSize:'.5rem',color:'rgba(0,255,65,.3)',letterSpacing:'.1em' }}>[{dialog.idx+1}/{dialog.lines.length}] SPACE ▶</div>
        </div>
      )}

      {/* PABLO STORE UPGRADE */}
      {showStore&&(
        <div style={{ position:'absolute',inset:0,background:'rgba(0,4,0,.93)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300 }}>
          <div style={{ width:420,maxWidth:'90vw',border:'1px solid rgba(0,255,65,.6)',background:'rgba(0,12,0,.98)',padding:'1.75rem' }}>
            <div style={{ fontFamily:"'VT323',monospace",fontSize:'1.8rem',color:'#00ff41',textShadow:'0 0 12px rgba(0,255,65,.4)',letterSpacing:'.15em',marginBottom:'.2rem' }}>PABLO DEVICE</div>
            <div style={{ fontSize:'.55rem',color:'rgba(0,255,65,.35)',letterSpacing:'.08em',marginBottom:'1.25rem' }}>REGISTERED — {char.name}</div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.6rem',marginBottom:'1.25rem' }}>
              {([[PABLO_PRODUCTS.FREE_TIER.name,['PABLO AI chat','World access']],[`${PABLO_PRODUCTS.PRO_TIER.name} — $4–6/mo`,[PABLO_PRODUCTS.PABLO_AI_PRO.short,PABLO_PRODUCTS.LIVE_LISTEN.short,PABLO_PRODUCTS.SCAN_SCREEN.short,PABLO_PRODUCTS.SAY_THIS.short,PABLO_PRODUCTS.CONTACTS.short]]] as [string,string[]][]).map(([t,f])=>(
                <div key={t} style={{ border:t===PABLO_PRODUCTS.FREE_TIER.name?'1px solid rgba(0,255,65,.18)':'1px solid rgba(0,255,65,.55)',padding:'.75rem',background:t!==PABLO_PRODUCTS.FREE_TIER.name?'rgba(0,255,65,.05)':'transparent' }}>
                  <div style={{ fontFamily:"'VT323',monospace",fontSize:'1rem',color:t===PABLO_PRODUCTS.FREE_TIER.name?'rgba(0,255,65,.45)':'#00ff41',letterSpacing:'.1em',marginBottom:'.4rem' }}>{t}</div>
                  {f.map(ff=><div key={ff} style={{ fontSize:'.57rem',color:t===PABLO_PRODUCTS.FREE_TIER.name?'rgba(0,255,65,.35)':'rgba(0,255,65,.65)',lineHeight:1.9 }}>▸ {ff}</div>)}
                </div>
              ))}
            </div>
            <div style={{ display:'flex',gap:'.6rem' }}>
              <button onClick={()=>{setShowStore(false);navigate('/upgrade');}} style={{ flex:1,padding:'.6rem',background:'rgba(0,255,65,.12)',border:'1px solid rgba(0,255,65,.65)',color:'#00ff41',fontFamily:"'VT323',monospace",fontSize:'1.1rem',letterSpacing:'.15em',cursor:'pointer' }}>{`GET ${PABLO_PRODUCTS.PRO_TIER.name}`}</button>
              <button onClick={()=>{setShowStore(false);setMsg(`> Device active [${PABLO_PRODUCTS.FREE_TIER.short}]. Press P to open.`);}} style={{ padding:'.6rem .9rem',background:'transparent',border:'1px solid rgba(0,255,65,.18)',color:'rgba(0,255,65,.4)',fontFamily:"'VT323',monospace",fontSize:'.9rem',cursor:'pointer' }}>{PABLO_PRODUCTS.FREE_TIER.short}</button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICE */}
      {showOffice&&(
        <div style={{ position:'absolute',inset:0,background:'rgba(0,4,0,.93)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300 }}>
          <div style={{ width:480,maxWidth:'92vw',border:'1px solid rgba(0,255,65,.5)',background:'rgba(0,12,0,.98)',padding:'1.75rem' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.25rem' }}>
              <div>
                <div style={{ fontFamily:"'VT323',monospace",fontSize:'1.8rem',color:'#00ff41',letterSpacing:'.14em' }}>OFFICE TOWER</div>
                <div style={{ fontSize:'.55rem',color:'rgba(0,255,65,.35)',letterSpacing:'.08em',marginTop:'.15rem' }}>PABLO CORP. MANAGED — SHARED COMMERCIAL SPACE</div>
              </div>
              <div style={{ display:'flex',gap:'.4rem',alignItems:'center' }}>
                {rentedOffice&&(
                  <button onClick={()=>{ const lk=lockMap.get('office'); setPwPrompt({bid:'office',label:'OFFICE TOWER',mode:lk?'enter':'set'}); setShowOffice(false); }} style={{ fontSize:'.5rem',padding:'2px 7px',background:'rgba(0,255,65,.07)',border:'1px solid rgba(0,255,65,.25)',color:'rgba(0,255,65,.5)',cursor:'pointer',fontFamily:"'Share Tech Mono',monospace" }}>
                    {lockMap.get('office')?'🔒 LOCKED':'SET CODE'}
                  </button>
                )}
                <button onClick={()=>setShowOffice(false)} style={{ background:'transparent',border:'none',color:'rgba(0,255,65,.35)',cursor:'pointer',fontFamily:"'VT323',monospace",fontSize:'1rem' }}>ESC</button>
              </div>
            </div>
            {rentedOffice&&<div style={{ marginBottom:'.9rem',padding:'.45rem .65rem',border:'1px solid rgba(0,255,65,.35)',background:'rgba(0,255,65,.05)',fontSize:'.6rem',color:'#00ff41' }}>▸ LEASED: {rentedOffice}</div>}
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.6rem',marginBottom:'1.25rem' }}>
              {OFFICE_TIERS.map(({id,label,price,desc})=>{
                const isRented=rentedOffice===label;
                const canAfford=salary>=price;
                return(
                  <div key={id} style={{ border:isRented?'1px solid rgba(0,255,65,.7)':'1px solid rgba(0,255,65,.18)',padding:'.75rem',background:isRented?'rgba(0,255,65,.07)':'transparent',position:'relative' }}>
                    {isRented&&<div style={{ position:'absolute',top:4,right:6,fontSize:'.48rem',color:'#00ff41',fontFamily:"'VT323',monospace" }}>LEASED</div>}
                    <div style={{ fontFamily:"'VT323',monospace",fontSize:'1rem',color:isRented?'#00ff41':'rgba(0,255,65,.65)',letterSpacing:'.07em',marginBottom:'.2rem' }}>{label}</div>
                    <div style={{ fontSize:'.65rem',color:isRented?'#00ff41':canAfford?'rgba(0,255,65,.55)':'rgba(255,100,100,.5)',fontFamily:"'VT323',monospace",marginBottom:'.3rem' }}>ƒ{price.toLocaleString()}</div>
                    <div style={{ fontSize:'.55rem',color:'rgba(0,255,65,.35)',lineHeight:1.6 }}>{desc}</div>
                    <button onClick={()=>{
                      if(isRented){ localStorage.removeItem('sm_office'); setRentedOffice(null); setMsg(`> Lease cancelled.`); return; }
                      if(!canAfford){ setMsg(`> Need ƒ${price}. Have ƒ${salary}.`); return; }
                      const g=gs.current; g.salary-=price; setSalary(g.salary);
                      localStorage.setItem('sm_office',label); setRentedOffice(label);
                      setMsg(`> ${label} leased. ƒ${price} deducted. Set a security code from the lease panel.`);
                    }} style={{ marginTop:'.5rem',width:'100%',padding:'.28rem',background:isRented?'rgba(255,50,50,.07)':canAfford?'rgba(0,255,65,.08)':'transparent',border:isRented?'1px solid rgba(255,80,80,.3)':canAfford?'1px solid rgba(0,255,65,.4)':'1px solid rgba(0,255,65,.1)',color:isRented?'rgba(255,80,80,.65)':canAfford?'#00ff41':'rgba(0,255,65,.18)',fontFamily:"'VT323',monospace",fontSize:'.85rem',letterSpacing:'.08em',cursor:canAfford||isRented?'pointer':'default' }}>
                      {isRented?'CANCEL':canAfford?'RENT':'NO FUNDS'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize:'.5rem',color:'rgba(0,255,65,.18)',lineHeight:1.7,borderTop:'1px solid rgba(0,255,65,.08)',paddingTop:'.65rem' }}>
              Tenants may set a security code. PABLO Corp. assumes no liability for mutant incursion or infrastructure failure.
            </div>
          </div>
        </div>
      )}

      {/* PASSWORD PROMPT */}
      {pwPrompt&&(
        <PwPrompt label={pwPrompt.label} onCancel={()=>{setPwPrompt(null);setPendingBid(null);}}
          onOk={(pw)=>{
            if(pwPrompt.mode==='set') wsSend({type:'building_lock_set',buildingId:pwPrompt.bid,password:pw});
            else wsSend({type:'building_lock_check',buildingId:pwPrompt.bid,password:pw});
          }} />
      )}

      {/* DEATH */}
      {isDead&&(
        <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'VT323',monospace",fontSize:'3.5rem',color:'#ff2222',textShadow:'0 0 24px rgba(255,0,0,.5)',letterSpacing:'.15em',marginBottom:'.75rem' }}>YOU ARE DEAD</div>
            <button onClick={()=>{ const g=gs.current; g.hp=100; g.px=5480; g.py=5910; g.threats=THREATS_INIT.map(t=>({...t})); g.invincible=120; setHp(100); setIsDead(false); setMsg('> You wake up in the hospital. The medic patched you up.'); }} style={{ padding:'.6rem 1.75rem',background:'rgba(255,0,0,.1)',border:'1px solid rgba(255,50,50,.45)',color:'#ff4444',fontFamily:"'VT323',monospace",fontSize:'1.4rem',letterSpacing:'.2em',cursor:'pointer' }}>GO TO HOSPITAL</button>
          </div>
        </div>
      )}
    </div>
  );
}

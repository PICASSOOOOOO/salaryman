import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, Headphones, LockKeyhole, Map, Pause, Play, Volume2 } from "lucide-react";
import "./SalarymanGameplayTour.css";

const rooms = [
  { name: "Tower Lobby", eyebrow: "ARRIVAL DECK", image: "/__mockup/images/salaryman-home/pygame/lobby.png", caption: "Start where the workday starts.", detail: "Meet the crew, read the morning brief, and choose your next move." },
  { name: "Recreation", eyebrow: "OFF-HOURS FLOOR", image: "/__mockup/images/salaryman-home/pygame/recreation.png", caption: "Make space for the in-between.", detail: "Recharge your team between shifts in a room built for small rituals." },
  { name: "Executive", eyebrow: "DIRECTION SUITE", image: "/__mockup/images/salaryman-home/pygame/executive.png", caption: "Decisions have a room.", detail: "Set priorities, review the pulse of the company, and send the day forward." },
  { name: "Workfloor", eyebrow: "OPERATIONS LEVEL", image: "/__mockup/images/salaryman-home/pygame/operations.png", caption: "Watch the whole system move.", detail: "Track output, energy, wages, and the live shift without leaving the floor." },
];

export default function SalarymanGameplayTour() {
  const [room, setRoom] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [sound, setSound] = useState(false);
  const active = rooms[room];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setRoom((current) => (current + 1) % rooms.length), 5200);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <main className="sgt-shell">
      <header className="sgt-topbar">
        <a className="sgt-logo" href="#tour" aria-label="SALARYMAN gameplay tour">
          <img src="/__mockup/images/salaryman-home/icon-192.png" alt="" />
          <span><b>SALARYMAN</b><small>PLAYABLE WORKDAY / TOUR 01</small></span>
        </a>
        <div className="sgt-topmeta"><span className="sgt-live-dot" /> LIVE CLIENT CAPTURE <i /> 04 ROOMS</div>
        <button className="sgt-download sgt-download-locked" type="button" disabled><LockKeyhole size={14} /> Desktop game in development</button>
      </header>

      <section className="sgt-layout" id="tour">
        <aside className="sgt-rail">
          <div className="sgt-rail-title"><Map size={15} /> ROOM MAP</div>
          <div className="sgt-room-list">
            {rooms.map((item, index) => (
              <button className={`sgt-room ${index === room ? "is-active" : ""}`} key={item.name} onClick={() => { setRoom(index); setPlaying(false); }}>
                <span className="sgt-room-number">0{index + 1}</span>
                <span><b>{item.name}</b><small>{item.eyebrow}</small></span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <div className="sgt-rail-note"><span>TIP</span><p>Use the room map to jump around, or press play to let the office unfold.</p></div>
          <div className="sgt-rail-bottom"><Headphones size={15} /> SOUND OFF BY DEFAULT</div>
        </aside>

        <div className="sgt-stage">
          <div className="sgt-stage-head">
            <div><span className="sgt-eyebrow">{active.eyebrow}</span><h1>{active.name}</h1></div>
            <div className="sgt-counter"><b>0{room + 1}</b><span>/ 04</span></div>
          </div>
          <div className="sgt-frame">
            <img key={active.image} src={active.image} alt={`${active.name} in the SALARYMAN desktop client`} />
            <div className="sgt-vignette" />
            <div className="sgt-frame-label"><span>DESKTOP CLIENT / BUILD 0.8.4</span><span>CAPTURED LIVE</span></div>
            <button className="sgt-play" type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause tour" : "Play tour"}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
            <div className="sgt-caption"><span className="sgt-caption-index">0{room + 1}</span><div><b>{active.caption}</b><p>{active.detail}</p></div></div>
          </div>
          <div className="sgt-controls">
            <button type="button" onClick={() => { setRoom((room + rooms.length - 1) % rooms.length); setPlaying(false); }}><ArrowLeft size={16} /> Previous room</button>
            <div className="sgt-progress">{rooms.map((item, index) => <button key={item.name} aria-label={`Go to ${item.name}`} className={index === room ? "is-active" : ""} onClick={() => { setRoom(index); setPlaying(false); }} />)}</div>
            <button type="button" onClick={() => { setRoom((room + 1) % rooms.length); setPlaying(false); }}>Next room <ArrowRight size={16} /></button>
          </div>
          <p className="sgt-lock-notice"><LockKeyhole size={13} /><span><b>Preview locked.</b> Download access opens when the bright solar-punk visual game build is ready.</span></p>
        </div>
      </section>

      <footer className="sgt-footer">
        <div><span className="sgt-footer-mark">✦</span><b>Not another dashboard.</b> A living office you can keep open all day.</div>
        <button type="button" onClick={() => setSound(!sound)}>{sound ? <Volume2 size={14} /> : <Volume2 size={14} />} {sound ? "Sound on" : "Sound off"}</button>
        <span className="sgt-footer-credit">PICASSO AI / SALARYMAN</span>
      </footer>

    </main>
  );
}
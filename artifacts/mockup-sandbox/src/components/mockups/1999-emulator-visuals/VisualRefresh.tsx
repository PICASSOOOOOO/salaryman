import { useState } from "react";
import "./_group.css";
import "./VisualRefresh.css";
import Fm1EmulatorPanel from "./Fm1EmulatorPanel";
import MinimoogEmulatorPanel from "./MinimoogEmulatorPanel";

type Machine = "fm1" | "smk37" | "minimoog";

const machineNames: Record<Machine, string> = {
  fm1: "M-VAVE FM-1",
  smk37: "M-VAVE SMK-37",
  minimoog: "Minimoog Model D",
};

const trackData = [
  { name: "Pulse", machine: "OP-1", pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] },
  { name: "Low end", machine: "FM-1", pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
  { name: "Air", machine: "KORG M1", pattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
  { name: "Loop 4", machine: "MIC LOOP", pattern: null },
];

export function VisualRefresh() {
  const [machine, setMachine] = useState<Machine>("fm1");
  const [patterns, setPatterns] = useState(trackData.map((track) => track.pattern ?? []));
  const [selectedTrack, setSelectedTrack] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [loopBars, setLoopBars] = useState(1);

  return (
    <main className="visual-refresh">
      <header className="visual-refresh__header">1999</header>
      <div className="visual-refresh__layout">
        <section className="visual-refresh__machine-panel" aria-label="Selected machine">
          <div className="visual-refresh__machine-head">
            <span>MACHINE</span>
            <select
              className="visual-refresh__machine-select"
              aria-label="Machine"
              value={machine}
              onChange={(event) => setMachine(event.target.value as Machine)}
              data-testid="select-machine"
            >
              <option value="fm1">{machineNames.fm1}</option>
              <option value="smk37">{machineNames.smk37}</option>
              <option value="minimoog">{machineNames.minimoog}</option>
            </select>
          </div>
          <div className="visual-refresh__instrument">
            {machine === "minimoog"
              ? <MinimoogEmulatorPanel />
              : <Fm1EmulatorPanel initialMachine={machine} />}
          </div>
        </section>

        <aside className="visual-refresh__daw" aria-label="Arrangement and mix">
          <section className="visual-refresh__panel">
            <header className="visual-refresh__panel-head">
              <span>ARRANGEMENT</span>
              <div className="visual-refresh__transport">
                <button type="button" onClick={() => setIsPlaying((value) => !value)} data-testid="button-play">
                  {isPlaying ? "STOP" : "PLAY"}
                </button>
                <span>92 BPM</span>
              </div>
            </header>
            <div className="visual-refresh__ruler">
              <span>TRACK</span>
              <div>{Array.from({ length: 16 }, (_, index) => <span key={index}>{index % 4 === 0 ? index / 4 + 1 : "·"}</span>)}</div>
              <span />
            </div>
            {trackData.map((track, trackIndex) => (
              <div
                className={`visual-refresh__track${selectedTrack === trackIndex ? " is-selected" : ""}`}
                key={track.name}
                onClick={() => setSelectedTrack(trackIndex)}
                data-testid={`row-track-${trackIndex}`}
              >
                <div className="visual-refresh__track-name">
                  <strong>{track.name}</strong>
                  <span>{track.machine}</span>
                </div>
                {track.pattern ? (
                  <div className="visual-refresh__steps">
                    {patterns[trackIndex].map((active, stepIndex) => (
                      <button
                        type="button"
                        className={active ? "is-on" : ""}
                        key={stepIndex}
                        aria-label={`${track.name} step ${stepIndex + 1}`}
                        aria-pressed={!!active}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPatterns((current) => current.map((pattern, index) => index !== trackIndex
                            ? pattern
                            : pattern.map((value, i) => i === stepIndex ? (value ? 0 : 1) : value)));
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="visual-refresh__audio-clip"><span>AUDIO LOOP</span></div>
                )}
                <button
                  className="visual-refresh__mute"
                  type="button"
                  aria-label="Mute track"
                  onClick={(event) => event.stopPropagation()}
                >M</button>
              </div>
            ))}
            <div className="visual-refresh__add-lane"><button type="button">＋ TRACK</button><span>04 / 08</span></div>
          </section>

          <section className="visual-refresh__panel">
            <header className="visual-refresh__panel-head"><span>MIXER</span><span>{trackData[selectedTrack].name}</span></header>
            <label className="visual-refresh__level">
              <span>OUTPUT LEVEL</span>
              <span>72%</span>
              <input type="range" min="0" max="100" defaultValue="72" aria-label="Output level" />
            </label>
          </section>

          <section className="visual-refresh__panel">
            <header className="visual-refresh__panel-head"><span>LIVE LOOP</span><span className={isRecording ? "is-live" : ""}>{isRecording ? "REC" : "MIC"}</span></header>
            <div className="visual-refresh__record-controls">
              <label htmlFor="loop-bars">BARS</label>
              <select id="loop-bars" value={loopBars} onChange={(event) => setLoopBars(Number(event.target.value))}>
                {[1, 2, 4].map((bars) => <option value={bars} key={bars}>{bars}</option>)}
              </select>
              <button type="button" className={isRecording ? "is-recording" : ""} onClick={() => setIsRecording((value) => !value)}>
                {isRecording ? "STOP LOOP" : `REC ${loopBars} BAR${loopBars > 1 ? "S" : ""}`}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

export default VisualRefresh;

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

export function VisualRefresh() {
  const [machine, setMachine] = useState<Machine>("fm1");

  return (
    <main className="visual-refresh">
      <section className="visual-refresh__workspace" aria-label="1999 selected machine panel">
        <section className="visual-refresh__machine-panel" aria-label="Selected lane controls">
          <div className="visual-refresh__panel-head">
            <p>02 / Machine</p>
            <span>Lane setup</span>
          </div>
          <div className="visual-refresh__machine-body">
            <div className="visual-refresh__machine-plate">
              <strong>99<br />/ 01</strong>
              <span>Sketch</span>
            </div>
            <label className="visual-refresh__machine-label" htmlFor="selected-machine">
              Machine
            </label>
            <select
              id="selected-machine"
              className="visual-refresh__machine-select"
              value={machine}
              onChange={(event) => setMachine(event.target.value as Machine)}
            >
              <option value="fm1">{machineNames.fm1}</option>
              <option value="smk37">{machineNames.smk37}</option>
              <option value="minimoog">{machineNames.minimoog}</option>
            </select>
            <div className="visual-refresh__knob-row">
              <label htmlFor="output-level">Output level</label>
              <span>65%</span>
              <input id="output-level" type="range" min="0" max="100" defaultValue="65" />
            </div>
          </div>
        </section>

        <section className="visual-refresh__emulator" aria-label={`${machineNames[machine]} emulator`}>
          <div className="visual-refresh__panel-head">
            <p>03 / Emulator</p>
            <span>{machineNames[machine]}</span>
          </div>
          {machine === "minimoog" ? (
            <MinimoogEmulatorPanel />
          ) : (
            <Fm1EmulatorPanel initialMachine={machine} />
          )}
        </section>
      </section>
    </main>
  );
}

export default VisualRefresh;

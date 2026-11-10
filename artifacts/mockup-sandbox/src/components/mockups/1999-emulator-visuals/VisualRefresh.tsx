import "./_group.css";
import "./VisualRefresh.css";
import Fm1EmulatorPanel from "./Fm1EmulatorPanel";
import MinimoogEmulatorPanel from "./MinimoogEmulatorPanel";

function InstrumentHeading({
  index,
  name,
  family,
  detail,
}: {
  index: string;
  name: string;
  family: string;
  detail: string;
}) {
  return (
    <header className="visual-refresh__instrument-heading">
      <span className="visual-refresh__index">{index}</span>
      <div>
        <p>{family}</p>
        <h2>{name}</h2>
      </div>
      <span className="visual-refresh__detail">{detail}</span>
    </header>
  );
}

export function VisualRefresh() {
  return (
    <main className="visual-refresh">
      <header className="visual-refresh__topbar">
        <a className="visual-refresh__wordmark" href="#bay" aria-label="SALARYMAN 1999 home">
          <span>SALARYMAN</span>
          <b>1999</b>
        </a>
        <div className="visual-refresh__breadcrumb">
          <span>WORKSPACE</span>
          <span aria-hidden="true">/</span>
          <strong>HARDWARE BAY</strong>
        </div>
        <span className="visual-refresh__session"><i /> SESSION 04 — READY</span>
      </header>

      <section className="visual-refresh__intro" id="bay">
        <div>
          <p className="visual-refresh__overline">THE INSTRUMENT ROOM <span>·</span> 03 UNITS</p>
          <h1>Make room<br className="visual-refresh__mobile-break" /> for sound.</h1>
          <p className="visual-refresh__lede">
            Three distinct machines. Their original controls, right here in your 1999 workspace.
          </p>
        </div>
        <div className="visual-refresh__bay-status" aria-label="Hardware status">
          <span className="visual-refresh__status-light" />
          <span>HARDWARE BAY</span>
          <strong>ONLINE</strong>
          <small>LOCAL CONTROLS · NO SYNC</small>
        </div>
      </section>

      <div className="visual-refresh__rule">
        <span>01—03 / SELECT AN INSTRUMENT</span>
        <span>FM SYNTHS <b>02</b><i /> ANALOG <b>01</b></span>
      </div>

      <section className="visual-refresh__fm-row" aria-label="M-VAVE synthesizers">
        <article className="visual-refresh__instrument visual-refresh__instrument--fm">
          <InstrumentHeading
            index="01"
            family="M·VAVE / POCKET FM"
            name="FM-1"
            detail="6-VOICE · DIGITAL"
          />
          <Fm1EmulatorPanel initialMachine="fm1" />
        </article>
        <article className="visual-refresh__instrument visual-refresh__instrument--smk">
          <InstrumentHeading
            index="02"
            family="M·VAVE / KEYBOARD SYNTH"
            name="SMK-37"
            detail="37-KEY · CONTROLLER"
          />
          <Fm1EmulatorPanel initialMachine="smk37" />
        </article>
      </section>

      <section className="visual-refresh__instrument visual-refresh__instrument--moog">
        <InstrumentHeading
          index="03"
          family="MOOG / MONOPHONIC ANALOG"
          name="Minimoog Model D"
          detail="1970s CLASSIC · BROWSER EMULATOR"
        />
        <MinimoogEmulatorPanel />
      </section>

      <footer className="visual-refresh__footer">
        <span>1999 — A PLACE TO MAKE THINGS</span>
        <span>INSTRUMENTS REMAIN INDEPENDENT <b>·</b> SOUND ON YOUR TERMS</span>
      </footer>
    </main>
  );
}

export default VisualRefresh;

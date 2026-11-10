import "./_group.css";
import Fm1EmulatorPanel from "./Fm1EmulatorPanel";
import MinimoogEmulatorPanel from "./MinimoogEmulatorPanel";

export function Current() {
  return (
    <main className="hardware-showcase">
      <header className="hardware-showcase__title">
        <h1>1999 / HARDWARE BAY</h1>
        <span>FM-1 · SMK37 · MINIMOOG MODEL D</span>
      </header>
      <div className="hardware-showcase__panels">
        <section className="hardware-showcase__section">
          <h2>FIRMWARE EMULATORS</h2>
          <Fm1EmulatorPanel />
        </section>
        <section className="hardware-showcase__section">
          <h2>MINIMOOG MODEL D</h2>
          <MinimoogEmulatorPanel />
        </section>
      </div>
    </main>
  );
}

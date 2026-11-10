import { useState } from "react";
import { ExternalLink } from "lucide-react";
import "./MinimoogEmulatorPanel.css";

const EMULATOR_URL = "https://www.minimoog.app/";
const SOURCE_URL = "https://github.com/stevebarakat/Minimoog";

export default function MinimoogEmulatorPanel() {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="minimoog-emulator" data-machine="minimoog" data-testid="minimoog-emulator">
      <header className="minimoog-emulator__header">
        <div>
          <span className="minimoog-emulator__eyebrow">1999 HARDWARE BAY</span>
          <h2>MINIMOOG MODEL D</h2>
          <p>
            Opens the upstream browser emulator. Its controls and presets are separate
            from this 1999 project; sequencer playback does not drive the embed.
          </p>
        </div>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          SOURCE / LICENSE <ExternalLink size={12} aria-hidden="true" />
        </a>
      </header>

      <div className="minimoog-emulator__controls">
        {!isLoaded ? (
          <button
            type="button"
            className="minimoog-emulator__launch"
            onClick={() => setIsLoaded(true)}
            data-testid="button-load-minimoog"
          >
            Load Minimoog emulator
          </button>
        ) : (
          <span role="status" data-testid="status-minimoog-loaded">
            Emulator loaded from minimoog.app
          </span>
        )}
        <a href={EMULATOR_URL} target="_blank" rel="noopener noreferrer">
          Open in new tab <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>

      {isLoaded && (
        <iframe
          className="minimoog-emulator__frame"
          src={EMULATOR_URL}
          title="Minimoog Model D browser emulator"
          loading="lazy"
          referrerPolicy="no-referrer"
          allow="autoplay; midi"
          allowFullScreen
          data-testid="iframe-minimoog-emulator"
        />
      )}
    </div>
  );
}

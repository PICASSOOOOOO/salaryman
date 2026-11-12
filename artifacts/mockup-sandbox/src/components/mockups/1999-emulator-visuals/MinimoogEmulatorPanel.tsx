import { useState } from "react";
import { ExternalLink } from "lucide-react";
import "./MinimoogEmulatorPanel.css";

const MINIMOOG_URL = "https://www.minimoog.app/";
const SOURCE_URL = "https://github.com/stevebarakat/Minimoog";

export default function MinimoogEmulatorPanel() {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="minimoog-emulator" data-testid="minimoog-emulator">
      <header className="minimoog-emulator__header">
        <div>
          <h2>MINIMOOG MODEL D</h2>
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
            Load Minimoog
          </button>
        ) : (
          <span role="status" data-testid="status-minimoog-loaded">
            Instrument is ready
          </span>
        )}
        <a href={MINIMOOG_URL} target="_blank" rel="noopener noreferrer">
            Open in new tab <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>

      {isLoaded && (
        <iframe
          className="minimoog-emulator__frame"
          src={MINIMOOG_URL}
          title="Minimoog Model D"
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

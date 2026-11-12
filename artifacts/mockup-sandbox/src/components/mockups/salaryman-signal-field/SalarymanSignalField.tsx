import { useState } from "react";
import { ArrowUpRight, Crosshair, Menu, Minus, Plus, Radio, RotateCcw } from "lucide-react";
import "./SalarymanSignalField.css";

const contours = [
  "M55 402 C110 325 164 348 217 278 S322 181 389 234 S491 352 560 262 S670 125 755 194 S852 310 940 239 S1062 145 1162 196",
  "M36 438 C114 355 168 392 232 313 S335 213 404 267 S500 384 578 299 S682 165 766 226 S857 347 950 274 S1068 181 1200 229",
  "M18 470 C98 390 178 430 246 350 S349 250 418 300 S509 418 598 333 S702 204 784 258 S870 383 965 311 S1089 219 1218 263",
  "M-20 505 C74 428 178 471 259 388 S366 284 433 332 S526 450 618 369 S722 242 806 294 S894 420 985 351 S1100 262 1247 302",
  "M-34 548 C67 468 181 511 273 425 S381 323 451 369 S541 487 641 402 S745 281 827 329 S918 457 1007 392 S1124 303 1265 345",
  "M-38 590 C65 514 188 551 288 467 S394 360 467 407 S557 524 659 442 S766 319 850 367 S941 496 1030 431 S1146 344 1277 387",
  "M-27 632 C78 558 200 593 301 509 S410 402 484 449 S573 567 677 484 S783 362 870 409 S962 538 1053 474 S1168 389 1292 430",
];

export default function SalarymanSignalField() {
  const [focused, setFocused] = useState("NORTH / 04");
  const [zoom, setZoom] = useState(1);

  return (
    <main className="signal-preview" data-testid="signal-field-preview">
      <header className="signal-topbar">
        <div className="signal-brand" data-testid="text-salaryman-brand">
          <span className="signal-brand-mark">S</span>
          <span><b>SALARYMAN</b><small>business operating system</small></span>
        </div>
        <nav className="signal-nav" aria-label="Preview navigation">
          <span className="signal-nav-active">Overview</span><span>Workspace</span><span>Signals</span>
        </nav>
        <div className="signal-top-actions">
          <span className="signal-live"><i /> SYSTEM LIVE</span>
          <button className="signal-menu" type="button" aria-label="Open menu" data-testid="button-signal-menu"><Menu size={17} /></button>
        </div>
      </header>

      <section className="signal-hero">
        <div className="signal-copy">
          <div className="signal-eyebrow"><Radio size={13} /> THE BUSINESS OPERATING SYSTEM</div>
          <h1>Make work feel <em>possible.</em></h1>
          <p>Calls, customers, files, and daily operations in one clear workspace.</p>
          <button className="signal-cta" type="button" data-testid="button-open-workspace">Open workspace <ArrowUpRight size={15} /></button>
          <div className="signal-meta"><span>01</span><i /> A clearer operating rhythm</div>
        </div>

        <div className="signal-window" data-testid="panel-signal-field">
          <div className="signal-window-bar">
            <div className="signal-window-dots"><i /><i /><i /></div>
            <span>salaryman / signal-field</span>
            <span className="signal-readout">LIVE / 08:42:16</span>
          </div>
          <div className="signal-canvas">
            <div className="signal-canvas-label"><span>FIELD ANALYSIS</span><b>RESPONSIVE CONTOURS</b></div>
            <svg className="signal-map" viewBox="0 0 1200 680" role="img" aria-label="Animated abstract contour field">
              <defs>
                <radialGradient id="fieldGlow" cx="52%" cy="45%" r="53%"><stop offset="0" stopColor="#9ce7b6" stopOpacity=".18" /><stop offset=".48" stopColor="#62b383" stopOpacity=".06" /><stop offset="1" stopColor="#07100d" stopOpacity="0" /></radialGradient>
                <filter id="softBlur"><feGaussianBlur stdDeviation="18" /></filter>
              </defs>
              <rect width="1200" height="680" fill="url(#fieldGlow)" />
              <g className="signal-contours">{contours.map((d, index) => <path key={d} d={d} className={`contour contour-${index}`} />)}</g>
              <g className="signal-focus focus-one" onClick={() => setFocused("NORTH / 04")}><circle r="9" /><circle r="24" className="focus-ring" /><path d="M-34 0H-13M13 0h21M0-34v21M0 13v21" /></g>
              <g className="signal-focus focus-two" onClick={() => setFocused("EAST / 12")}><circle r="6" /><circle r="18" className="focus-ring" /></g>
              <g className="signal-focus focus-three" onClick={() => setFocused("SOUTH / 07")}><circle r="5" /><circle r="15" className="focus-ring" /></g>
              <ellipse className="signal-wash" cx="606" cy="342" rx="310" ry="118" filter="url(#softBlur)" />
            </svg>
            <div className="signal-coordinate"><span>LAT 37.7749</span><span>LONG 122.4194</span></div>
            <div className="signal-focus-label"><Crosshair size={12} /><span>FOCUS POINT</span><strong>{focused}</strong></div>
            <div className="signal-zoom">
              <button type="button" aria-label="Zoom out" data-testid="button-zoom-out" onClick={() => setZoom(Math.max(.8, zoom - .1))}><Minus size={14} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Zoom in" data-testid="button-zoom-in" onClick={() => setZoom(Math.min(1.3, zoom + .1))}><Plus size={14} /></button>
            </div>
            <button className="signal-reset" type="button" onClick={() => { setFocused("NORTH / 04"); setZoom(1); }} data-testid="button-reset-field"><RotateCcw size={12} /> Reset field</button>
          </div>
          <div className="signal-window-footer"><span><i className="dot-green" /> CONTOURS STABLE</span><span>7 LAYERS / 3 FOCUS POINTS</span><span>CLICK A POINT TO INSPECT</span></div>
        </div>
      </section>

      <footer className="signal-bottomline"><span>BUILT FOR THE WORKING DAY</span><span>One home for the work <b>↗</b></span><span>SCROLL TO CONNECT</span></footer>
    </main>
  );
}
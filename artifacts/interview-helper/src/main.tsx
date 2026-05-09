import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { initLowGfx } from "./lib/lowGfx";

initLowGfx();
createRoot(document.getElementById("root")!).render(<App />);

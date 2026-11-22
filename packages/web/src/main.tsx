import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Order matters: base defines the colour tokens the others use.
import "./styles/base.css";
import "./styles/track.css";
import "./styles/list.css";
import "./styles/detail.css";
import "./styles/controls.css";
import "./styles/stats.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

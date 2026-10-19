import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/raleway/latin-400.css";
import "@fontsource/raleway/latin-500.css";
import "@fontsource/raleway/latin-600.css";
import "@fontsource/raleway/latin-700.css";
import "@fontsource/raleway/latin-800.css";
import "./styles.css";
import { App } from "./App";
import { MODE_DEMO } from "./data";
import { demarrerPwa } from "./pwa";

if (!MODE_DEMO) demarrerPwa();

createRoot(document.getElementById("racine")!).render(<StrictMode><App /></StrictMode>);

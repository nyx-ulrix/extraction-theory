import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource/inter/700.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

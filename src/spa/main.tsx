import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpaApp } from "./router";
import "@/styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("Missing #root element");
createRoot(el).render(
  <StrictMode>
    <SpaApp />
  </StrictMode>,
);

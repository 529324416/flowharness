import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/tokens.css";
import "./styles/global.css";

// 首帧主题：在 React 挂载前写死，避免亮暗闪烁。
// Phase 1 接入 AppConfig 后，这里改为读取持久化偏好（system/light/dark）。
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset["theme"] = prefersDark ? "dark" : "light";

const container = document.getElementById("root");
if (!container) {
  throw new Error("FlowHarness: #root element is missing");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

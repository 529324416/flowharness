import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/tokens.css";
import "./styles/global.css";

// 首帧主题：深色优先；上次选择从 localStorage 快速恢复，避免闪白。
// 真正的偏好仍以 AppConfig 为准（ThemeProvider 启动后会覆盖）。
const cachedTheme = window.localStorage.getItem("fh.theme");
document.documentElement.dataset["theme"] = cachedTheme === "light" ? "light" : "dark";
document.documentElement.dataset["windowMode"] = window.flowharness.windowMode;

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

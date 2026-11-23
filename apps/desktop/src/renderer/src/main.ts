import "./style.css";

// The canonical integration point: wireclaw is a normal package dependency.
import { Graph } from "wireclaw";

function setRows(listId: string, rows: ReadonlyArray<readonly [string, string]>): void {
  const list = document.getElementById(listId);
  if (!list) return;

  const nodes = rows.flatMap(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    return [term, detail];
  });

  list.replaceChildren(...nodes);
}

const bootGraph = new Graph([], [], {
  id: "flowharness-renderer-boot",
  title: "FlowHarness renderer boot",
});
const bridge = window.flowharness;

setRows("runtime", [
  ["Electron", bridge.versions.electron],
  ["Node", bridge.versions.node],
  ["Chromium", bridge.versions.chrome],
  ["平台", bridge.platform],
]);

setRows("wireclaw", [
  ["引入方式", 'import { Graph } from "wireclaw"'],
  ["Graph 类", typeof Graph === "function" ? "已加载" : "缺失"],
  ["Graph id", bootGraph.id],
  ["节点 / 边", `${bootGraph.nodes.length} / ${bootGraph.edges.length}`],
]);

const status = document.getElementById("status");
if (status) {
  status.textContent = "开发环境就绪：Electron ↔ Wireclaw 已联通";
  status.classList.add("is-ready");
}

bridge.reportReady({
  renderer: {
    wireclawGraphLoaded: typeof Graph === "function",
    wireclawGraphId: bootGraph.id,
  },
  versions: bridge.versions,
});

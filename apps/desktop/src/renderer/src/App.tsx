import { useEffect, useRef, type ReactElement } from "react";
// Wireclaw 以普通包依赖的方式引入；这里用于自检链路是否打通。
import { Graph } from "wireclaw";
import { useTheme } from "./theme/ThemeProvider";

const bootGraph = new Graph([], [], {
  id: "flowharness-renderer-boot",
  title: "FlowHarness renderer boot",
});

type MetaRow = readonly [label: string, value: string];

function MetaList({ rows }: { rows: ReadonlyArray<MetaRow> }): ReactElement {
  return (
    <dl className="meta-list">
      {rows.map(([label, value]) => (
        <div key={label} className="meta-list__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function App(): ReactElement {
  const { theme, toggleTheme } = useTheme();
  const bridge = window.flowharness;
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    bridge.reportReady({
      renderer: {
        framework: "react",
        wireclawGraphLoaded: typeof Graph === "function",
        wireclawGraphId: bootGraph.id,
      },
      versions: bridge.versions,
    });
  }, [bridge]);

  const runtimeRows: MetaRow[] = [
    ["Electron", bridge.versions.electron],
    ["Node", bridge.versions.node],
    ["Chromium", bridge.versions.chrome],
    ["平台", bridge.platform],
    ["UI", "React 19"],
  ];

  const wireclawRows: MetaRow[] = [
    ["引入方式", 'import { Graph } from "wireclaw"'],
    ["Graph 类", typeof Graph === "function" ? "已加载" : "缺失"],
    ["Graph id", bootGraph.id],
    ["节点 / 边", `${bootGraph.nodes.length} / ${bootGraph.edges.length}`],
  ];

  return (
    <main className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">Agent Workbench</p>
          <h1 className="app__title">FlowHarness</h1>
          <p className="app__subtitle">开发环境自检 · Phase 0</p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "切换到亮色主题" : "切换到暗色主题"}
        >
          <span className="theme-toggle__icon" aria-hidden="true">
            {theme === "dark" ? "☾" : "☀"}
          </span>
          {theme === "dark" ? "暗色" : "亮色"}
        </button>
      </header>

      <section className="grid">
        <article className="card">
          <h2 className="card__title">运行时</h2>
          <MetaList rows={runtimeRows} />
        </article>

        <article className="card">
          <h2 className="card__title">Wireclaw</h2>
          <MetaList rows={wireclawRows} />
        </article>
      </section>

      <footer className="status">
        <span className="status__dot" aria-hidden="true" />
        开发环境就绪：Electron ↔ Wireclaw ↔ React 已联通
      </footer>
    </main>
  );
}

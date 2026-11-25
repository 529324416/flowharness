import { useEffect, useRef, useState, type ReactElement } from "react";
import type {
    RunEventDto,
    RunSnapshot,
    WorkspaceSummary,
} from "@flowharness/contracts";
import {
    History,
    SlidersHorizontal,
    Terminal,
} from "lucide-react";
import { Badge, EmptyState } from "../../ui";
import type { InspectorModel } from "../../inspector/model";
import type { DesignerProblem } from "../../designer/core/problems";
import { SessionHistoryView } from "../../views/SessionHistoryView";
import type { SessionSummary } from "../sessions";
import { FloatingPanel } from "./FloatingPanel";
import { InspectorContent } from "./InspectorContent";
import { RunLogContent } from "./RunLogContent";
import type { FloatingPanelState, PanelId } from "./useFloatingPanels";
import styles from "./PanelLayer.module.css";

export type SessionHistoryPanelInput = {
    workspace: WorkspaceSummary;
    session: SessionSummary;
    onOpenDesigner: () => void;
};

export type PanelLayerProps = {
    panels: FloatingPanelState[];
    events: readonly RunEventDto[];
    snapshot: RunSnapshot | null;
    inspector: InspectorModel | null;
    problems: readonly DesignerProblem[];
    sessionHistory?: SessionHistoryPanelInput | null;
    onSelectProblem?: (problem: DesignerProblem) => void;
    onClose: (id: PanelId) => void;
    onFocus: (id: PanelId) => void;
    onUpdate: (id: PanelId, patch: Partial<FloatingPanelState>) => void;
};

export function PanelLayer({
    panels,
    events,
    snapshot,
    inspector,
    problems,
    sessionHistory,
    onSelectProblem,
    onClose,
    onFocus,
    onUpdate,
}: PanelLayerProps): ReactElement {
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const update = (): void => {
            const rect = element.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const openPanels = panels.filter((panel) => panel.open);

    return (
        <div ref={ref} className={styles.layer} aria-label="浮动面板层">
            {size.width > 0 && size.height > 0
                ? openPanels.map((panel) =>
                      panel.id === "run-log" ? (
                          <FloatingPanel
                              key={panel.id}
                              panel={panel}
                              containerWidth={size.width}
                              containerHeight={size.height}
                              title="运行日志"
                              icon={<Terminal size={16} aria-hidden="true" />}
                              badge={<Badge variant="neutral">{events.length}</Badge>}
                              footer={
                                  <>
                                      <span>{snapshot?.runId ?? "尚无运行"}</span>
                                      <span>最近 120 条</span>
                                  </>
                              }
                              onUpdate={onUpdate}
                              onClose={() => onClose(panel.id)}
                              onFocus={() => onFocus(panel.id)}
                          >
                              <RunLogContent
                                  events={events}
                                  snapshot={snapshot}
                                  problems={problems}
                                  onSelectProblem={onSelectProblem}
                              />
                          </FloatingPanel>
                      ) : panel.id === "session-history" ? (
                          <FloatingPanel
                              key={panel.id}
                              panel={panel}
                              containerWidth={size.width}
                              containerHeight={size.height}
                              title="会话历史"
                              icon={<History size={16} aria-hidden="true" />}
                              badge={
                                  <Badge variant="neutral">
                                      {sessionHistory?.session.title ?? "未选择"}
                                  </Badge>
                              }
                              footer={<span>会话已持久化到工作区</span>}
                              onUpdate={onUpdate}
                              onClose={() => onClose(panel.id)}
                              onFocus={() => onFocus(panel.id)}
                          >
                              {sessionHistory ? (
                                  <SessionHistoryView
                                      workspace={sessionHistory.workspace}
                                      session={sessionHistory.session}
                                      onOpenDesigner={sessionHistory.onOpenDesigner}
                                      embedded
                                  />
                              ) : (
                                  <EmptyState
                                      title="没有打开的会话"
                                      description="在左侧 Session 树中选择一条会话。"
                                  />
                              )}
                          </FloatingPanel>
                      ) : (
                          <FloatingPanel
                              key={panel.id}
                              panel={panel}
                              containerWidth={size.width}
                              containerHeight={size.height}
                              title="属性"
                              icon={<SlidersHorizontal size={16} aria-hidden="true" />}
                              badge={
                                  <Badge variant="neutral">
                                      {inspector?.node?.title ?? "图"}
                                  </Badge>
                              }
                              onUpdate={onUpdate}
                              onClose={() => onClose(panel.id)}
                              onFocus={() => onFocus(panel.id)}
                          >
                              <InspectorContent model={inspector} />
                          </FloatingPanel>
                      ),
                  )
                : null}
        </div>
    );
}

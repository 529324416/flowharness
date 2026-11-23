import type { ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import type { RunEventDto, RunSnapshot } from "@flowharness/contracts";
import {
    Badge,
    EmptyState,
    IconButton,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    type BadgeVariant,
} from "../ui";
import styles from "./BottomPanel.module.css";

function badgeFor(event: RunEventDto): BadgeVariant {
    if (event.type === "node:error") return "danger";
    if (event.type === "run:end") {
        if (event.status === "failed") return "danger";
        if (event.status === "completed") return "success";
        if (event.status === "cancelled") return "warning";
    }
    if (event.type === "run:start" || event.type === "run:paused" || event.type === "run:resumed") {
        return "accent";
    }
    return "neutral";
}

function detailFor(event: RunEventDto): string {
    switch (event.type) {
        case "run:start":
            return event.graphId;
        case "run:end":
            return `status=${event.status}`;
        case "node:start":
        case "node:end":
        case "node:skipped":
        case "node:error":
        case "node:stream":
            return event.nodeId;
        case "custom":
            return `${event.name} (${event.nodeId})`;
        case "run:paused":
        case "run:resumed":
            return "";
    }
}

function formatTime(at: number): string {
    return new Date(at).toTimeString().slice(0, 8);
}

export type BottomPanelProps = {
    events: readonly RunEventDto[];
    snapshot: RunSnapshot | null;
    onCollapse: () => void;
};

export function BottomPanel({ events, snapshot, onCollapse }: BottomPanelProps): ReactElement {
    const visible = events.slice(-120);

    return (
        <Tabs defaultValue="log" className={styles.root}>
            <div className={styles.head}>
                <TabsList className={styles.list}>
                    <TabsTrigger value="log">
                        运行日志
                        <Badge className={styles.count}>{events.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="problems">问题</TabsTrigger>
                </TabsList>

                <div className={styles.headActions}>
                    {snapshot ? (
                        <span className={styles.runId}>{snapshot.runId}</span>
                    ) : null}
                    <IconButton label="收起底部面板" size="sm" onClick={onCollapse}>
                        <ChevronDown size={14} aria-hidden="true" />
                    </IconButton>
                </div>
            </div>

            <TabsContent value="log" className={styles.content}>
                {visible.length === 0 ? (
                    <EmptyState
                        compact
                        title="暂无运行事件"
                        description="运行一个 Graph 后，事件流会显示在这里"
                    />
                ) : (
                    <ul className={styles.log}>
                        {visible.map((event, index) => (
                            <li key={`${event.at}-${index}`} className={styles.row}>
                                <span className={styles.time}>{formatTime(event.at)}</span>
                                <Badge variant={badgeFor(event)}>{event.type}</Badge>
                                <span className={styles.detail}>{detailFor(event)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </TabsContent>

            <TabsContent value="problems" className={styles.content}>
                <EmptyState
                    compact
                    title="暂无问题"
                    description="运行失败或校验错误会显示在这里"
                />
            </TabsContent>
        </Tabs>
    );
}

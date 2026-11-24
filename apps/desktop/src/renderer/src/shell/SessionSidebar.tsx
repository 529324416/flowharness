import { useMemo, useRef, useState, type ReactElement } from "react";
import { PanelLeftClose, Plus, Search } from "lucide-react";
import { Badge, IconButton, Input, StatusDot, Tooltip } from "../ui";
import { cx } from "../ui/cx";
import { SESSION_TONE, type SessionSummary } from "./sessions";
import styles from "./SessionSidebar.module.css";

export type SessionSidebarProps = {
    sessions: SessionSummary[];
    activeId: string | null;
    width: number;
    onSelect: (id: string) => void;
    onNew: () => void;
    onCollapse: () => void;
    onResize: (width: number) => void;
};

const MIN_WIDTH = 200;
const MAX_WIDTH = 360;

function clampWidth(width: number): number {
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

export function SessionSidebar({
    sessions,
    activeId,
    width,
    onSelect,
    onNew,
    onCollapse,
    onResize,
}: SessionSidebarProps): ReactElement {
    const [query, setQuery] = useState("");
    const drag = useRef<{ x: number; width: number } | null>(null);

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return sessions;
        return sessions.filter((session) =>
            `${session.title} ${session.subtitle}`.toLowerCase().includes(term),
        );
    }, [query, sessions]);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
        drag.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (!drag.current) return;
        onResize(clampWidth(drag.current.width + event.clientX - drag.current.x));
    };

    const handlePointerUp = (): void => {
        drag.current = null;
    };

    return (
        <aside className={styles.sidebar} aria-label="会话列表">
            <header className={styles.header}>
                <span className={styles.title}>会话</span>
                <Badge variant="neutral">示例</Badge>
                <div className={styles.spacer} />
                <Tooltip label="新建会话">
                    <IconButton label="新建会话" size="sm" onClick={onNew}>
                        <Plus size={19} aria-hidden="true" />
                    </IconButton>
                </Tooltip>
                <Tooltip label="收起会话栏">
                    <IconButton label="收起会话栏" size="sm" onClick={onCollapse}>
                        <PanelLeftClose size={19} aria-hidden="true" />
                    </IconButton>
                </Tooltip>
            </header>

            <div className={styles.search}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                    <Input
                        className={styles.searchInput}
                        aria-label="搜索会话"
                        placeholder="搜索会话…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
            </div>

            <div className={styles.list}>
                {filtered.length === 0 ? (
                    <p className={styles.empty}>没有匹配的会话</p>
                ) : (
                    filtered.map((session) => (
                        <button
                            key={session.id}
                            type="button"
                            data-session-id={session.id}
                            className={cx(
                                styles.item,
                                session.id === activeId && styles.active,
                            )}
                            onClick={() => onSelect(session.id)}
                        >
                            <span className={styles.dot}>
                                <StatusDot
                                    tone={SESSION_TONE[session.status]}
                                    pulse={session.status === "running"}
                                />
                            </span>
                            <span className={styles.itemMain}>
                                <span className={styles.itemTitle}>{session.title}</span>
                                <span className={styles.itemMeta}>
                                    {session.subtitle} · {session.updatedAt}
                                </span>
                            </span>
                        </button>
                    ))
                )}
            </div>

            <footer className={styles.footer}>会话数据将在 Phase 5 接入</footer>

            <div
                className={styles.resize}
                role="separator"
                aria-orientation="vertical"
                aria-label="调整会话栏宽度"
                tabIndex={0}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        onResize(clampWidth(width - 16));
                    } else if (event.key === "ArrowRight") {
                        event.preventDefault();
                        onResize(clampWidth(width + 16));
                    }
                }}
            />
        </aside>
    );
}

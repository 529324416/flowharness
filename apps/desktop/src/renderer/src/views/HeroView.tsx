import type { ReactElement } from "react";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { Button, Kbd, StatusDot } from "../ui";
import { SESSION_TONE, type SessionSummary } from "../shell/sessions";
import styles from "./HeroView.module.css";

export type HeroViewProps = {
    sessions: SessionSummary[];
    onNewSession: () => void;
    onSelectSession: (id: string) => void;
};

export function HeroView({
    sessions,
    onNewSession,
    onSelectSession,
}: HeroViewProps): ReactElement {
    const example = sessions[0];

    return (
        <section className={styles.root} aria-label="会话欢迎页">
            <div className={styles.grid} aria-hidden="true" />
            <div className={styles.glow} aria-hidden="true" />

            <div className={styles.content}>
                <div className={styles.eyebrow}>
                    <span className={styles.mark} aria-hidden="true">
                        FH
                    </span>
                    <span>SESSION WORKBENCH</span>
                </div>

                <h1 className={styles.title}>从一条会话开始</h1>
                <p className={styles.description}>
                    把输入、模型调用与输出铺到画布上。选择左侧会话继续，
                    或新建一条空会话开始编排。
                </p>

                <div className={styles.actions}>
                    <Button variant="primary" onClick={onNewSession}>
                        <Plus size={15} aria-hidden="true" />
                        新建会话
                    </Button>
                    {example ? (
                        <Button
                            variant="secondary"
                            onClick={() => onSelectSession(example.id)}
                        >
                            <Sparkles size={15} aria-hidden="true" />
                            打开示例
                        </Button>
                    ) : null}
                </div>

                {sessions.length > 0 ? (
                    <div className={styles.templates} aria-label="示例会话">
                        {sessions.slice(0, 3).map((session) => (
                            <button
                                key={session.id}
                                type="button"
                                className={styles.template}
                                onClick={() => onSelectSession(session.id)}
                            >
                                <span className={styles.templateTop}>
                                    <StatusDot
                                        tone={SESSION_TONE[session.status]}
                                        pulse={session.status === "running"}
                                    />
                                    <span className={styles.templateTitle}>
                                        {session.title}
                                    </span>
                                    <ArrowRight size={13} aria-hidden="true" />
                                </span>
                                <span className={styles.templateMeta}>
                                    {session.subtitle} · {session.updatedAt}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className={styles.hints}>
                    <span>
                        <Kbd>Ctrl N</Kbd> 新建会话
                    </span>
                    <span>
                        <Kbd>Ctrl B</Kbd> 收起/展开会话栏
                    </span>
                    <span>
                        <Kbd>Ctrl 1</Kbd> 设计器
                    </span>
                </div>
            </div>
        </section>
    );
}

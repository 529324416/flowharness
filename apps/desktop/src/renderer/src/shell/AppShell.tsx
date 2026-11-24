import type { CSSProperties, ReactElement, ReactNode } from "react";
import { cx } from "../ui/cx";
import styles from "./AppShell.module.css";

export type AppShellProps = {
    titleBar: ReactNode;
    ribbon: ReactNode;
    sidebar: ReactNode;
    sidebarOpen: boolean;
    sidebarWidth: number;
    main: ReactNode;
    statusBar: ReactNode;
};

/** VS Code 式外壳：TitleBar / Ribbon + SessionSidebar + Main / StatusBar。 */
export function AppShell({
    titleBar,
    ribbon,
    sidebar,
    sidebarOpen,
    sidebarWidth,
    main,
    statusBar,
}: AppShellProps): ReactElement {
    const style = {
        "--fh-sidebar-current": `${sidebarWidth}px`,
    } as CSSProperties;

    return (
        <div className={cx(styles.root, !sidebarOpen && styles.noSidebar)} style={style}>
            <div className={styles.title}>{titleBar}</div>
            <div className={styles.body}>
                <div className={styles.ribbon}>{ribbon}</div>
                {sidebarOpen ? <div className={styles.sidebar}>{sidebar}</div> : null}
                <main className={styles.main}>{main}</main>
            </div>
            <div className={styles.status}>{statusBar}</div>
        </div>
    );
}

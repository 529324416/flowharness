import type { ReactElement, ReactNode } from "react";
import { cx } from "../ui/cx";
import styles from "./AppShell.module.css";

export type AppShellProps = {
    topBar: ReactNode;
    rail: ReactNode;
    main: ReactNode;
    inspector?: ReactNode | null;
    bottomPanel?: ReactNode | null;
    statusBar: ReactNode;
};

/** 六区外壳：TopBar / Rail / Main / Inspector / BottomPanel / StatusBar。 */
export function AppShell({
    topBar,
    rail,
    main,
    inspector,
    bottomPanel,
    statusBar,
}: AppShellProps): ReactElement {
    return (
        <div
            className={cx(
                styles.root,
                inspector ? undefined : styles.noInspector,
                bottomPanel ? undefined : styles.noPanel,
            )}
        >
            <div className={styles.top}>{topBar}</div>
            <div className={styles.rail}>{rail}</div>
            <div className={styles.main}>
                <div className={styles.viewport}>{main}</div>
                {bottomPanel ? <div className={styles.bottom}>{bottomPanel}</div> : null}
            </div>
            {inspector ? <div className={styles.inspector}>{inspector}</div> : null}
            <div className={styles.status}>{statusBar}</div>
        </div>
    );
}

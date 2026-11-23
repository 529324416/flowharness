import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Kbd.module.css";

export function Kbd({ children, className }: { children: ReactNode; className?: string }): ReactElement {
    return <kbd className={cx(styles.kbd, className)}>{children}</kbd>;
}

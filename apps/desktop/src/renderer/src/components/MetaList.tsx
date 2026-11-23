import type { ReactElement } from "react";
import styles from "./MetaList.module.css";

export type MetaRow = readonly [label: string, value: string];

export function MetaList({ rows }: { rows: ReadonlyArray<MetaRow> }): ReactElement {
    return (
        <dl className={styles.list}>
            {rows.map(([label, value]) => (
                <div key={label} className={styles.row}>
                    <dt className={styles.term}>{label}</dt>
                    <dd className={styles.detail}>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

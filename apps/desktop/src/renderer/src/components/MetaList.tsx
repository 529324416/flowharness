import type { ReactElement } from "react";

export type MetaRow = readonly [label: string, value: string];

export function MetaList({ rows }: { rows: ReadonlyArray<MetaRow> }): ReactElement {
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

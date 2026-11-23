import type { ReactElement } from "react";
import { Activity, Palette, Settings, Workflow } from "lucide-react";
import { IconButton, Tooltip } from "../ui";
import type { ViewId } from "./views";
import styles from "./LeftRail.module.css";

const ITEMS: ReadonlyArray<{
    id: ViewId;
    label: string;
    icon: typeof Workflow;
}> = [
    { id: "designer", label: "设计器", icon: Workflow },
    { id: "diagnostics", label: "诊断", icon: Activity },
    { id: "styleguide", label: "样式指南", icon: Palette },
];

export type LeftRailProps = {
    view: ViewId;
    onChange: (view: ViewId) => void;
};

export function LeftRail({ view, onChange }: LeftRailProps): ReactElement {
    return (
        <nav className={styles.rail} aria-label="主导航">
            <div className={styles.group}>
                {ITEMS.map(({ id, label, icon: Icon }) => (
                    <Tooltip key={id} label={label} side="right">
                        <IconButton
                            label={label}
                            size="md"
                            variant="ghost"
                            aria-current={view === id ? "page" : undefined}
                            className={view === id ? styles.active : undefined}
                            onClick={() => onChange(id)}
                        >
                            <Icon size={20} aria-hidden="true" />
                        </IconButton>
                    </Tooltip>
                ))}
            </div>

            <div className={styles.group}>
                <Tooltip label="设置（Phase 3）" side="right">
                    <span>
                        <IconButton label="设置" disabled>
                            <Settings size={20} aria-hidden="true" />
                        </IconButton>
                    </span>
                </Tooltip>
            </div>
        </nav>
    );
}

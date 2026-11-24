import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "./cx";
import styles from "./Checkbox.module.css";

export type CheckboxProps = {
    id?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: ReactNode;
    disabled?: boolean;
    className?: string;
};

/** 主题化勾选框：隐藏原生外观，显示自绘方框；键盘与读屏仍由原生 input 承担。 */
export function Checkbox({
    id,
    checked,
    onChange,
    label,
    disabled = false,
    className,
}: CheckboxProps) {
    return (
        <label className={cx(styles.row, disabled && styles.disabled, className)}>
            <input
                id={id}
                type="checkbox"
                className={styles.input}
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span className={styles.box} aria-hidden="true">
                <Check size={12} strokeWidth={3} />
            </span>
            {label === undefined ? null : <span className={styles.label}>{label}</span>}
        </label>
    );
}

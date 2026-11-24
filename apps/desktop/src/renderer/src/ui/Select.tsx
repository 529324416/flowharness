import { Check, ChevronDown } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./Menu";
import { cx } from "./cx";
import styles from "./Select.module.css";

export type SelectOption = {
    value: string;
    label: string;
};

export type SelectProps = {
    id?: string;
    value: string | undefined;
    options: readonly SelectOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    "aria-label"?: string;
};

/**
 * 主题化下拉选择。
 *
 * 用 Radix DropdownMenu 承担焦点 / 键盘 / 关闭行为，触发器与选项都走 tokens；
 * 不再使用原生 `<select>` 的弹层。
 */
export function Select({
    id,
    value,
    options,
    onChange,
    disabled = false,
    placeholder,
    className,
    "aria-label": ariaLabel,
}: SelectProps) {
    const selected = options.find((option) => option.value === value);

    return (
        <Menu>
            <MenuTrigger asChild>
                <button
                    id={id}
                    type="button"
                    className={cx(styles.trigger, className)}
                    disabled={disabled}
                    aria-label={ariaLabel}
                >
                    <span
                        className={cx(
                            styles.value,
                            selected === undefined && styles.placeholder,
                        )}
                    >
                        {selected?.label ?? placeholder ?? "请选择"}
                    </span>
                    <ChevronDown
                        size={15}
                        className={styles.chevron}
                        aria-hidden="true"
                    />
                </button>
            </MenuTrigger>
            <MenuContent align="start" side="bottom" className={styles.menu}>
                {options.map((option) => (
                    <MenuItem
                        key={option.value}
                        className={styles.item}
                        onSelect={() => onChange(option.value)}
                    >
                        <span className={styles.itemLabel}>{option.label}</span>
                        {option.value === value ? (
                            <Check
                                size={14}
                                className={styles.check}
                                aria-hidden="true"
                            />
                        ) : null}
                    </MenuItem>
                ))}
            </MenuContent>
        </Menu>
    );
}

import {
    forwardRef,
    type ComponentPropsWithoutRef,
    type ReactElement,
    type ReactNode,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cx } from "./cx";
import styles from "./Menu.module.css";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

export function MenuContent({
    className,
    ...rest
}: ComponentPropsWithoutRef<typeof DropdownMenu.Content>): ReactElement {
    return (
        <DropdownMenu.Portal>
            <DropdownMenu.Content
                sideOffset={6}
                className={cx(styles.content, className)}
                {...rest}
            />
        </DropdownMenu.Portal>
    );
}

export const MenuItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<typeof DropdownMenu.Item>
>(function MenuItem({ className, ...rest }, ref) {
    return (
        <DropdownMenu.Item
            ref={ref}
            className={cx(styles.item, className)}
            {...rest}
        />
    );
});

export const MenuSeparator = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(function MenuSeparator({ className, ...rest }, ref) {
    return (
        <DropdownMenu.Separator
            ref={ref}
            className={cx(styles.separator, className)}
            {...rest}
        />
    );
});

export const MenuLabel = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(function MenuLabel({ className, ...rest }, ref) {
    return (
        <DropdownMenu.Label
            ref={ref}
            className={cx(styles.label, className)}
            {...rest}
        />
    );
});

export function MenuShortcut({ children }: { children: ReactNode }): ReactElement {
    return <span className={styles.shortcut}>{children}</span>;
}

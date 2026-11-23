import {
    forwardRef,
    type ComponentPropsWithoutRef,
    type ReactElement,
    type ReactNode,
} from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { cx } from "./cx";
import styles from "./Menu.module.css";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({
    className,
    ...rest
}: ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>): ReactElement {
    return (
        <ContextMenuPrimitive.Portal>
            <ContextMenuPrimitive.Content
                className={cx(styles.content, className)}
                {...rest}
            />
        </ContextMenuPrimitive.Portal>
    );
}

export const ContextMenuItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(function ContextMenuItem({ className, ...rest }, ref) {
    return (
        <ContextMenuPrimitive.Item
            ref={ref}
            className={cx(styles.item, className)}
            {...rest}
        />
    );
});

export const ContextMenuSeparator = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(function ContextMenuSeparator({ className, ...rest }, ref) {
    return (
        <ContextMenuPrimitive.Separator
            ref={ref}
            className={cx(styles.separator, className)}
            {...rest}
        />
    );
});

export const ContextMenuLabel = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>
>(function ContextMenuLabel({ className, ...rest }, ref) {
    return (
        <ContextMenuPrimitive.Label
            ref={ref}
            className={cx(styles.label, className)}
            {...rest}
        />
    );
});

export function ContextMenuShortcut({ children }: { children: ReactNode }): ReactElement {
    return <span className={styles.shortcut}>{children}</span>;
}

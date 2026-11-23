import { forwardRef, type ComponentPropsWithoutRef } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cx } from "./cx";
import styles from "./Tabs.module.css";

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...rest }, ref) {
    return <TabsPrimitive.List ref={ref} className={cx(styles.list, className)} {...rest} />;
});

export const TabsTrigger = forwardRef<
    HTMLButtonElement,
    ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...rest }, ref) {
    return (
        <TabsPrimitive.Trigger
            ref={ref}
            className={cx(styles.trigger, className)}
            {...rest}
        />
    );
});

export const TabsContent = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...rest }, ref) {
    return (
        <TabsPrimitive.Content
            ref={ref}
            className={cx(styles.content, className)}
            {...rest}
        />
    );
});

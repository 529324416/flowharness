import type { ReactElement, ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import styles from "./Tooltip.module.css";

export const TooltipProvider = TooltipPrimitive.Provider;

export type TooltipProps = {
    label: string;
    children: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
};

export function Tooltip({ label, children, side = "bottom", align = "center" }: TooltipProps): ReactElement {
    return (
        <TooltipPrimitive.Root delayDuration={300}>
            <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                    className={styles.content}
                    side={side}
                    align={align}
                    sideOffset={6}
                >
                    {label}
                    <TooltipPrimitive.Arrow className={styles.arrow} />
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
    );
}

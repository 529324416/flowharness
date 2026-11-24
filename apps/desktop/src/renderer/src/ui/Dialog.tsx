import type { ReactElement, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cx } from "./cx";
import styles from "./Dialog.module.css";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type DialogContentProps = {
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
};

export function DialogContent({
    title,
    description,
    children,
    footer,
    className,
}: DialogContentProps): ReactElement {
    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className={styles.overlay} />
            <DialogPrimitive.Content className={cx(styles.content, className)}>
                <header className={styles.header}>
                    <div className={styles.heading}>
                        <DialogPrimitive.Title className={styles.title}>
                            {title}
                        </DialogPrimitive.Title>
                        {description ? (
                            <DialogPrimitive.Description className={styles.description}>
                                {description}
                            </DialogPrimitive.Description>
                        ) : null}
                    </div>
                    <DialogPrimitive.Close className={styles.close} aria-label="关闭">
                        <X size={20} aria-hidden="true" />
                    </DialogPrimitive.Close>
                </header>

                <div className={styles.body}>{children}</div>

                {footer ? <footer className={styles.footer}>{footer}</footer> : null}
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
}

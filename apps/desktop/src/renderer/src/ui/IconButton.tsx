import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./IconButton.module.css";

export type IconButtonVariant = "ghost" | "secondary";
export type IconButtonSize = "sm" | "md";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
    /** 必填：图标按钮没有可见文本，必须提供可访问名称。 */
    label: string;
    variant?: IconButtonVariant;
    size?: IconButtonSize;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        { label, variant = "ghost", size = "md", className, type = "button", ...rest },
        ref,
    ) {
        return (
            <button
                ref={ref}
                type={type}
                aria-label={label}
                title={label}
                className={cx(styles.button, styles[variant], styles[size], className)}
                {...rest}
            />
        );
    },
);

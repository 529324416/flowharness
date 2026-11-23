import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = "secondary", size = "md", className, type = "button", ...rest },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            className={cx(styles.button, styles[variant], styles[size], className)}
            {...rest}
        />
    );
});

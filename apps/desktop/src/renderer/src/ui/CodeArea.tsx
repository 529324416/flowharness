import {
    useRef,
    type KeyboardEvent,
    type ReactElement,
    type UIEvent,
} from "react";
import { cx } from "./cx";
import { JsonCodeText } from "./JsonCodeText";
import styles from "./CodeArea.module.css";

export type CodeAreaProps = {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    onFocus?: () => void;
    onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    disabled?: boolean;
    readOnly?: boolean;
    ariaLabel?: string;
    placeholder?: string;
    className?: string;
    /** 最小高度（px）；内容超出后在控件内部滚动。 */
    minHeight?: number;
};

/**
 * 带 JSON 语法着色的代码输入区。
 *
 * 实现方式是「透明 textarea + 同字体的高亮层」：textarea 负责光标、选择、
 * 输入法与滚动，pre 只负责着色，因此不需要引入编辑器依赖。
 * 两层使用完全相同的字体、字号、行高与内边距，滚动位置由 onScroll 同步。
 */
export function CodeArea({
    id,
    value,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
    disabled = false,
    readOnly = false,
    ariaLabel,
    placeholder,
    className,
    minHeight,
}: CodeAreaProps): ReactElement {
    const highlightRef = useRef<HTMLPreElement>(null);

    const syncScroll = (event: UIEvent<HTMLTextAreaElement>): void => {
        const highlight = highlightRef.current;
        if (highlight === null) return;
        highlight.scrollTop = event.currentTarget.scrollTop;
        highlight.scrollLeft = event.currentTarget.scrollLeft;
    };

    return (
        <div
            className={cx(styles.wrap, disabled && styles.disabled, className)}
            style={minHeight === undefined ? undefined : { minHeight }}
        >
            <pre ref={highlightRef} className={styles.highlight} aria-hidden="true">
                {value.length === 0 ? " " : <JsonCodeText text={value} />}
                {"\n"}
            </pre>
            <textarea
                id={id}
                className={styles.editor}
                value={value}
                disabled={disabled}
                readOnly={readOnly}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                wrap="off"
                aria-label={ariaLabel}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
                onFocus={onFocus}
                onKeyDown={onKeyDown}
                onScroll={syncScroll}
            />
        </div>
    );
}

import type { ReactElement } from "react";
import { tokenizeJson, type JsonTokenType } from "./json-highlight";
import styles from "./JsonCodeText.module.css";

const TOKEN_CLASS: Readonly<Record<JsonTokenType, string | undefined>> = {
    key: styles.key,
    string: styles.string,
    number: styles.number,
    boolean: styles.literal,
    null: styles.literal,
    punctuation: styles.punctuation,
    plain: undefined,
};

/**
 * 只读 JSON 着色文本。
 *
 * 与 `CodeArea` 共用 `json-highlight` 的分词与同一套 token 颜色；
 * 只输出行内 span，不负责排版，供 Constant 阅读态等场景复用。
 */
export function JsonCodeText({ text }: { text: string }): ReactElement {
    return (
        <>
            {tokenizeJson(text).map((token, index) => (
                <span key={index} className={TOKEN_CLASS[token.type]}>
                    {token.text}
                </span>
            ))}
        </>
    );
}

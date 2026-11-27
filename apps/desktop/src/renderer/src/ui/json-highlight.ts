/**
 * JSON 源码的展示层分词。
 *
 * 只负责着色，不做结构校验：无法识别的片段按 plain 原样保留，
 * 空白单独成 token，保证拼接后与原文逐字一致（高亮层才能与 textarea 对齐）。
 */

export type JsonTokenType =
    | "key"
    | "string"
    | "number"
    | "boolean"
    | "null"
    | "punctuation"
    | "plain";

export type JsonToken = {
    text: string;
    type: JsonTokenType;
};

const PUNCTUATION = new Set(["{", "}", "[", "]", ",", ":"]);

function isWhitespace(char: string): boolean {
    return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isDigit(char: string): boolean {
    return char >= "0" && char <= "9";
}

/** 从 `"` 开始扫描字符串，返回结束位置（含收尾引号）；未闭合时返回源码长度。 */
function scanString(source: string, start: number): number {
    let index = start + 1;
    while (index < source.length) {
        const char = source[index];
        if (char === "\\") {
            index += 2;
            continue;
        }
        if (char === '"') return index + 1;
        index += 1;
    }
    return source.length;
}

/** 扫描数字；不是数字时返回起始位置。 */
function scanNumber(source: string, start: number): number {
    let index = start;
    if (source[index] === "-") index += 1;

    const digitsStart = index;
    while (index < source.length && isDigit(source[index] as string)) index += 1;
    if (index === digitsStart) return start;

    if (source[index] === ".") {
        index += 1;
        while (index < source.length && isDigit(source[index] as string)) index += 1;
    }

    if (source[index] === "e" || source[index] === "E") {
        index += 1;
        if (source[index] === "+" || source[index] === "-") index += 1;
        while (index < source.length && isDigit(source[index] as string)) index += 1;
    }

    return index;
}

export function tokenizeJson(source: string): JsonToken[] {
    const tokens: JsonToken[] = [];
    let index = 0;

    while (index < source.length) {
        const char = source[index] as string;

        if (char === '"') {
            const end = scanString(source, index);
            const text = source.slice(index, end);

            // 字符串后（跳过空白）紧跟冒号时是对象键。
            let lookahead = end;
            while (lookahead < source.length && isWhitespace(source[lookahead] as string)) {
                lookahead += 1;
            }
            const closed = text.length >= 2 && text.endsWith('"');
            const type: JsonTokenType = !closed
                ? "plain"
                : source[lookahead] === ":"
                  ? "key"
                  : "string";

            tokens.push({ text, type });
            index = end;
            continue;
        }

        if (char === "-" || isDigit(char)) {
            const end = scanNumber(source, index);
            if (end > index) {
                tokens.push({ text: source.slice(index, end), type: "number" });
                index = end;
                continue;
            }
        }

        if (source.startsWith("true", index)) {
            tokens.push({ text: "true", type: "boolean" });
            index += 4;
            continue;
        }
        if (source.startsWith("false", index)) {
            tokens.push({ text: "false", type: "boolean" });
            index += 5;
            continue;
        }
        if (source.startsWith("null", index)) {
            tokens.push({ text: "null", type: "null" });
            index += 4;
            continue;
        }

        if (PUNCTUATION.has(char)) {
            tokens.push({ text: char, type: "punctuation" });
            index += 1;
            continue;
        }

        if (isWhitespace(char)) {
            const start = index;
            while (index < source.length && isWhitespace(source[index] as string)) {
                index += 1;
            }
            tokens.push({ text: source.slice(start, index), type: "plain" });
            continue;
        }

        // 非法字符逐字保留，避免高亮层与编辑器内容错位。
        tokens.push({ text: char, type: "plain" });
        index += 1;
    }

    return tokens;
}

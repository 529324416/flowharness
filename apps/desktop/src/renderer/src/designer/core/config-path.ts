import type { JsonObject, JsonValue } from "wireclaw";

/** config 的点路径；数组下标由表单自行处理，这里只处理对象字段。 */
export type ConfigPath = readonly string[];

/**
 * 读取嵌套 config。
 *
 * 路径不存在或中间值不是对象时返回 undefined；不解释数组下标。
 */
export function readConfigPath(
    config: unknown,
    path: ConfigPath,
): JsonValue | undefined {
    let cursor: unknown = config;

    for (const segment of path) {
        if (!isRecord(cursor)) return undefined;
        cursor = cursor[segment];
    }

    return cursor as JsonValue | undefined;
}

/**
 * 写入嵌套 config，返回新的对象（不修改入参）。
 *
 * - 路径中间缺失时自动创建对象；
 * - `value === undefined` 时删除该键；
 * - 结果是空对象时，删除父级键，避免留下 `{ parameters: {} }` 这类空壳。
 */
export function writeConfigPath(
    config: unknown,
    path: ConfigPath,
    value: JsonValue | undefined,
): JsonObject {
    if (path.length === 0) {
        return value !== undefined && isRecord(value) ? { ...value } : {};
    }

    const root: JsonObject = isRecord(config) ? { ...config } : {};
    const [head, ...rest] = path;
    if (head === undefined) return root;

    if (rest.length === 0) {
        if (value === undefined) {
            delete root[head];
        } else {
            root[head] = value;
        }
        return root;
    }

    const child = writeConfigPath(root[head], rest, value);
    if (Object.keys(child).length === 0) {
        delete root[head];
    } else {
        root[head] = child;
    }
    return root;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

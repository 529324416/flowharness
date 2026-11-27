import type { JsonValue } from "wireclaw";
import { findNodeCatalogEntry } from "./catalog";

/**
 * 折叠态保留的字段。
 *
 * 规则：字段值「有数据」且不等于节点类型的默认值时才保留。默认值来自
 * configSchema 的 `default` 与节点类型的 `defaultConfig`；两者都没有时，
 * 任何非空值都算数据。这样新加节点的默认 config（mode / permission /
 * 内嵌图模板等）不会在折叠态占位，只有用户真正填过或改过的字段才显示。
 */
export function collapsedVisibleFields(
    kind: string,
    config: unknown,
): readonly string[] {
    if (!isRecord(config)) return [];

    const entry = findNodeCatalogEntry(kind);
    const schemaProperties = isRecord(entry?.configSchema?.properties)
        ? (entry.configSchema.properties as Record<string, unknown>)
        : {};
    const defaultConfig = isRecord(entry?.defaultConfig)
        ? (entry.defaultConfig as Record<string, unknown>)
        : {};

    const fields: string[] = [];
    for (const [key, value] of Object.entries(config)) {
        const schemaDefault = readSchemaDefault(schemaProperties[key]);
        const fallbackDefault = Object.prototype.hasOwnProperty.call(
            defaultConfig,
            key,
        )
            ? defaultConfig[key]
            : undefined;
        if (isFieldFilled(value, schemaDefault ?? fallbackDefault)) {
            fields.push(key);
        }
    }
    return fields;
}

/**
 * 字段是否值得在折叠态显示。
 *
 * - `undefined` / `null` / 空字符串 / 空数组 / 空对象没有数据；
 * - 与默认值相等视为「未手动填写」；
 * - 布尔值只有为 true（或默认值为 true 时被改为 false）才算数据，
 *   避免显式写回的 `false` 在折叠态制造噪点；
 * - 数字（含 0）视为数据。
 */
export function isFieldFilled(value: unknown, defaultValue?: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (defaultValue !== undefined && jsonEquals(value, defaultValue)) {
        return false;
    }

    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "boolean") return value || defaultValue === true;
    if (Array.isArray(value)) return value.length > 0;
    if (isRecord(value)) return Object.keys(value).length > 0;
    return true;
}

function readSchemaDefault(schema: unknown): unknown {
    if (!isRecord(schema)) return undefined;
    return (schema as { default?: JsonValue }).default;
}

/** JSON 值深比较；config 只包含 JSON 可序列化内容。 */
export function jsonEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        return a.every((item, index) => jsonEquals(item, b[index]));
    }
    if (isRecord(a) && isRecord(b)) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        return aKeys.every(
            (key) =>
                Object.prototype.hasOwnProperty.call(b, key) &&
                jsonEquals(a[key], b[key]),
        );
    }
    return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

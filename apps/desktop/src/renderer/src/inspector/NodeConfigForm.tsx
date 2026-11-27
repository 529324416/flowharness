import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { JsonObject, JsonValue } from "wireclaw";
import { validateNodeConfig, type NodeConfigIssue } from "wireclaw";
import {
    readConfigPath,
    writeConfigPath,
    type ConfigPath,
} from "../designer/core/config-path";
import { Checkbox, Field, Input, NumberField, Select, type SelectOption } from "../ui";
import styles from "./NodeConfigForm.module.css";

export type NodeConfigFormProps = {
    schema: JsonObject;
    config: unknown;
    disabled?: boolean;
    /** 运行时下拉覆盖：key 是字段名（如 providerId / modelId）。 */
    fieldOptions?: Readonly<Record<string, readonly SelectOption[]>>;
    /** 运行时只读覆盖值（Provider 已连接时显示来源 Provider）。 */
    fieldValues?: Readonly<Record<string, JsonValue | undefined>>;
    /** 特定字段的额外提示（例如 Provider 模型目录为空）。 */
    fieldHints?: Readonly<Record<string, string>>;
    /** 被连接固定、不可编辑的字段及原因。 */
    fieldLocks?: Readonly<Record<string, string>>;
    onChange: (config: JsonValue) => void;
};

/**
 * 按节点类型 configSchema 生成表单（wireclaw 的 JSON Schema 子集）。
 *
 * - 可表达的字段用控件渲染；
 * - `format: "json"` / `"graph"`、联合类型与无法识别的 schema 回退到 JSON 文本域；
 * - 整个 config 的原始 JSON 编辑仍由检查器的「JSON」页签承担。
 */
export function NodeConfigForm({
    schema,
    config,
    disabled = false,
    fieldOptions,
    fieldValues,
    fieldHints,
    fieldLocks,
    onChange,
}: NodeConfigFormProps): ReactElement {
    const issues = useMemo(
        () => validateNodeConfig(schema, config as JsonValue | undefined).issues,
        [schema, config],
    );

    const properties = asSchemaRecord(schema.properties);
    const types = readTypes(schema);
    const objectLike =
        properties !== undefined &&
        (types === undefined || types.includes("object"));

    if (!objectLike || properties === undefined) {
        return (
            <JsonValueField
                label="参数（JSON）"
                value={config as JsonValue | undefined}
                disabled={disabled}
                onChange={onChange}
            />
        );
    }

    const required = new Set(readRequired(schema.required));
    const keys = Object.keys(properties);

    if (keys.length === 0) {
        return <p className={styles.empty}>该节点没有可编辑参数。</p>;
    }

    return (
        <div className={styles.form}>
            {keys.map((key) => {
                const property = asSchema(properties[key]);
                if (property === undefined) return null;

                return (
                    <SchemaField
                        key={key}
                        name={key}
                        schema={property}
                        path={[key]}
                        value={
                            fieldValues !== undefined && key in fieldValues
                                ? fieldValues[key]
                                : readConfigPath(config, [key])
                        }
                        required={required.has(key)}
                        issues={issues}
                        disabled={disabled}
                        lockReason={fieldLocks?.[key]}
                        extraHint={fieldHints?.[key]}
                        options={fieldOptions?.[key]}
                        onChange={(path, next) => {
                            onChange(writeConfigPath(config, path, next));
                        }}
                    />
                );
            })}
        </div>
    );
}

type SchemaFieldProps = {
    name: string;
    schema: JsonObject;
    path: ConfigPath;
    value: JsonValue | undefined;
    required: boolean;
    issues: readonly NodeConfigIssue[];
    disabled: boolean;
    lockReason?: string | undefined;
    extraHint?: string | undefined;
    options?: readonly SelectOption[] | undefined;
    onChange: (path: ConfigPath, value: JsonValue | undefined) => void;
};

function SchemaField({
    name,
    schema,
    path,
    value,
    required,
    issues,
    disabled,
    lockReason,
    extraHint,
    options,
    onChange,
}: SchemaFieldProps): ReactElement {
    const label = readString(schema.title) ?? name;
    const description = readString(schema.description);
    const hint = [description, extraHint, lockReason]
        .filter((part): part is string => part !== undefined)
        .join(" · ");
    const pathKey = pathToString(path);
    const error = issues.find((issue) => issue.path === pathKey)?.message;
    const id = `config-${pathKey}`;
    const format = readString(schema.format);
    const enumOptions = readEnumOptions(schema);
    const types = readTypes(schema);
    const fieldDisabled = disabled || lockReason !== undefined;

    // 用 JSON 文本域兜底：显式 format、联合类型、缺 type 都落到这里。
    if (format === "json" || format === "graph" || types.length !== 1) {
        return (
            <Field
                label={label}
                hint={description}
                error={error}
                required={required}
                htmlFor={id}
            >
                <JsonValueField
                    id={id}
                    value={value}
                    disabled={disabled}
                    multiline
                    onChange={(next) => onChange(path, next)}
                />
            </Field>
        );
    }

    const type = types[0];

    if (options !== undefined && options.length > 0 && type === "string") {
        return (
            <Field
                label={label}
                hint={hint}
                error={error}
                required={required}
                htmlFor={id}
            >
                <Select
                    id={id}
                    value={typeof value === "string" ? value : undefined}
                    options={options}
                    disabled={fieldDisabled}
                    placeholder="请选择"
                    onChange={(next) =>
                        onChange(path, next === "" ? undefined : next)
                    }
                />
            </Field>
        );
    }

    if (enumOptions !== undefined) {
        return (
            <Field
                label={label}
                hint={description}
                error={error}
                required={required}
                htmlFor={id}
            >
                <Select
                    id={id}
                    value={typeof value === "string" ? value : undefined}
                    options={enumOptions}
                    disabled={disabled}
                    placeholder="请选择"
                    onChange={(next) => onChange(path, next)}
                />
            </Field>
        );
    }

    if (type === "boolean") {
        return (
            <div className={styles.switchRow}>
                <Checkbox
                    id={id}
                    checked={value === true}
                    disabled={disabled}
                    label={label}
                    onChange={(checked) => onChange(path, checked)}
                />
                {error !== undefined ? (
                    <p className={styles.error}>{error}</p>
                ) : description !== undefined ? (
                    <p className={styles.hint}>{description}</p>
                ) : null}
            </div>
        );
    }

    if (type === "integer" || type === "number") {
        return (
            <Field
                label={label}
                hint={description}
                error={error}
                required={required}
                htmlFor={id}
            >
                <NumberField
                    id={id}
                    value={typeof value === "number" ? value : undefined}
                    min={readNumber(schema.minimum)}
                    max={readNumber(schema.maximum)}
                    step={type === "integer" ? 1 : "any"}
                    disabled={disabled}
                    onChange={(next) => onChange(path, next)}
                />
            </Field>
        );
    }

    if (type === "array") {
        const items = asSchema(schema.items);
        const itemTypes = items === undefined ? [] : readTypes(items);

        if (itemTypes?.includes("string") === true) {
            return (
                <Field
                    label={label}
                    hint={description ?? "用逗号分隔多个值"}
                    error={error}
                    required={required}
                    htmlFor={id}
                >
                    <StringListField
                        id={id}
                        value={value}
                        disabled={disabled}
                        onChange={(next) => onChange(path, next)}
                    />
                </Field>
            );
        }

        return (
            <Field
                label={label}
                hint={description}
                error={error}
                required={required}
                htmlFor={id}
            >
                <JsonValueField
                    id={id}
                    value={value}
                    disabled={disabled}
                    multiline
                    onChange={(next) => onChange(path, next)}
                />
            </Field>
        );
    }

    if (type === "object") {
        const nested = asSchemaRecord(schema.properties);
        if (nested === undefined || Object.keys(nested).length === 0) {
            return (
                <Field
                    label={label}
                    hint={description}
                    error={error}
                    required={required}
                    htmlFor={id}
                >
                    <JsonValueField
                        id={id}
                        value={value}
                        disabled={disabled}
                        multiline
                        onChange={(next) => onChange(path, next)}
                    />
                </Field>
            );
        }

        const requiredKeys = new Set(readRequired(schema.required));
        return (
            <fieldset className={styles.group}>
                <legend className={styles.legend}>{label}</legend>
                {description === undefined ? null : (
                    <p className={styles.hint}>{description}</p>
                )}
                {Object.entries(nested).map(([key, raw]) => {
                    const property = asSchema(raw);
                    if (property === undefined) return null;
                    return (
                        <SchemaField
                            key={key}
                            name={key}
                            schema={property}
                            path={[...path, key]}
                            value={readConfigPath(value, [key])}
                            required={requiredKeys.has(key)}
                            issues={issues}
                            disabled={disabled}
                            onChange={onChange}
                        />
                    );
                })}
            </fieldset>
        );
    }

    return (
        <Field
            label={label}
            hint={hint}
            error={error}
            required={required}
            htmlFor={id}
        >
            <Input
                id={id}
                value={typeof value === "string" ? value : ""}
                disabled={fieldDisabled}
                onChange={(event) => onChange(path, event.target.value)}
            />
        </Field>
    );
}

function JsonValueField({
    id,
    value,
    disabled,
    multiline = false,
    onChange,
    label,
    description,
    error,
}: {
    id?: string;
    value: JsonValue | undefined;
    disabled: boolean;
    multiline?: boolean;
    onChange: (value: JsonValue) => void;
    label?: string;
    description?: string;
    error?: string;
}): ReactElement {
    const text = formatJson(value);
    const [draft, setDraft] = useState(text);
    const [parseError, setParseError] = useState<string | null>(null);

    useEffect(() => {
        setDraft(text);
        setParseError(null);
    }, [text]);

    const commit = (): void => {
        try {
            const parsed: unknown = JSON.parse(draft);
            setParseError(null);
            onChange(parsed as JsonValue);
        } catch (cause) {
            setParseError(
                `JSON 解析失败：${cause instanceof Error ? cause.message : String(cause)}`,
            );
        }
    };

    const field = (
        <>
            <textarea
                id={id}
                className={styles.json}
                value={draft}
                rows={multiline ? 6 : 3}
                spellCheck={false}
                disabled={disabled}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
            />
            {parseError !== null ? (
                <p className={styles.error}>{parseError}</p>
            ) : null}
        </>
    );

    if (label === undefined) {
        return field;
    }

    return (
        <Field label={label} hint={description} error={error}>
            {field}
        </Field>
    );
}

function StringListField({
    id,
    value,
    disabled,
    onChange,
}: {
    id?: string;
    value: JsonValue | undefined;
    disabled: boolean;
    onChange: (value: JsonValue) => void;
}): ReactElement {
    const text = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string").join(", ")
        : "";
    const [draft, setDraft] = useState(text);

    useEffect(() => {
        setDraft(text);
    }, [text]);

    const commit = (): void => {
        const items = draft
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        onChange(items);
    };

    return (
        <Input
            id={id}
            value={draft}
            disabled={disabled}
            placeholder="逗号分隔"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
        />
    );
}

function pathToString(path: ConfigPath): string {
    return path.join(".");
}

function formatJson(value: JsonValue | undefined): string {
    if (value === undefined) return "";
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return "";
    }
}

function readEnumOptions(schema: JsonObject): readonly SelectOption[] | undefined {
    const values = schema.enum;
    if (!Array.isArray(values)) return undefined;

    const labels = Array.isArray(schema.enumLabels) ? schema.enumLabels : [];
    const options: SelectOption[] = [];

    values.forEach((item, index) => {
        if (typeof item !== "string") return;
        const label = labels[index];
        options.push({
            value: item,
            label: typeof label === "string" ? label : item,
        });
    });

    return options.length === 0 ? undefined : options;
}

function readRequired(value: JsonValue | undefined): readonly string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
}

function readTypes(schema: JsonObject): readonly string[] {
    const type = schema.type;
    if (typeof type === "string") return [type];
    if (Array.isArray(type)) {
        return type.filter((item): item is string => typeof item === "string");
    }
    return [];
}

function readString(value: JsonValue | undefined): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function readNumber(value: JsonValue | undefined): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asSchema(value: unknown): JsonObject | undefined {
    return isRecord(value) ? (value as JsonObject) : undefined;
}

function asSchemaRecord(value: unknown): Record<string, JsonValue> | undefined {
    return isRecord(value) ? (value as Record<string, JsonValue>) : undefined;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

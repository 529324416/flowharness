import type { GraphDocument } from "wireclaw";
import { isGraphDocument } from "./document";

/** 解析导入的 Harness JSON；结构不合法返回 null。 */
export function parseHarnessJson(text: string): GraphDocument | null {
    try {
        const value: unknown = JSON.parse(text);
        return isGraphDocument(value) ? value : null;
    } catch {
        return null;
    }
}

/** 返回替换标题后的文档对象；非对象格式返回 null。 */
export function withDocumentTitle(value: unknown, title: string): unknown | null {
    if (!isRecord(value)) return null;
    return { ...value, title };
}

/** 导出 JSON；`stripUi` 时移除图级与节点级 ui。 */
export function serializeHarnessJson(
    value: unknown,
    options: { stripUi: boolean },
): string | null {
    if (!isGraphDocument(value)) return null;

    const document = structuredClone(value) as GraphDocument;
    if (options.stripUi) stripDocumentUi(document);
    return `${JSON.stringify(document, null, 2)}\n`;
}

/** 导入文档的默认标题：原 title 优先，其次文件名。 */
export function importDocumentTitle(
    fileName: string,
    sourceTitle?: string,
): string {
    if (sourceTitle !== undefined && sourceTitle.trim().length > 0) {
        return `${sourceTitle}（导入）`;
    }
    const base = fileName.replace(/\.json$/i, "").trim();
    return base.length > 0 ? base : "导入的图";
}

function stripDocumentUi(document: GraphDocument): void {
    delete document.ui;
    for (const node of document.nodes) {
        delete node.ui;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

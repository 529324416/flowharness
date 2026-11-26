import type { GraphDocument } from "wireclaw";
import { createGraphTemplate } from "../designer/core/document";

export type WorkbenchTemplate = {
    id: string;
    /** 新建工作台时显示的标题。 */
    title: string;
    description: string;
    /** 目标工作台类型；必须已注册。 */
    type: string;
    /** 新实例的默认标题；缺省由 type 推导。 */
    instanceTitle?: string;
    /** 为模板创建一条新的起始工作流；缺省绑定当前文档。 */
    createGraph?: (graphId: string) => GraphDocument;
};

/**
 * 新建工作台模板。
 *
 * 模板只负责「实例 + 可选起始工作流」，不保存工作台实例本身；
 * 创建流程与手动新建工作台一致（保存文档 → 刷新 → 打开）。
 */
export const WORKBENCH_TEMPLATES: readonly WorkbenchTemplate[] = [
    {
        id: "harness-blank",
        title: "Harness 设计器 · 空白工作流",
        description: "新建 Constant → Output 工作流并绑定到设计器",
        type: "harness-designer",
        instanceTitle: "主工作台",
        createGraph: (graphId) => createGraphTemplate(graphId, "未命名工作流"),
    },
    {
        id: "harness-current",
        title: "Harness 设计器 · 当前工作流",
        description: "在当前工作流上新建设计器",
        type: "harness-designer",
        instanceTitle: "设计器副本",
    },
    {
        id: "plan-runner",
        title: "批量运行",
        description: "选择多条工作流顺序运行",
        type: "plan-runner",
        instanceTitle: "批量运行",
    },
];

export function getWorkbenchTemplate(id: string): WorkbenchTemplate | undefined {
    return WORKBENCH_TEMPLATES.find((template) => template.id === id);
}

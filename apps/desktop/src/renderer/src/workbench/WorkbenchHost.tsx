import type { ReactElement, ReactNode } from "react";
import { EmptyState } from "../ui";
import { getWorkbench } from "./registry";
import type { WorkbenchViewProps } from "./types";

export type WorkbenchHostProps = WorkbenchViewProps & {
    /** 工作台壳层提供的浮动面板层（运行结果 / 会话历史 / 属性等）。 */
    panelLayer?: ReactNode;
};

/** 工作台宿主：按实例 type 与当前阶段选择定义并渲染 View。 */
export function WorkbenchHost({
    panelLayer,
    ...props
}: WorkbenchHostProps): ReactElement {
    // 独立运行页已移除：运行直接在主设计器的画布上进行，运行时只读。
    if (props.instance.type === "flow-runner") {
        return (
            <EmptyState
                title="运行页已移除"
                description="运行直接在设计器画布中进行，运行期间自动禁止编辑。请切换到主工作台，或从工作台菜单删除此实例。"
            />
        );
    }

    // 旧「节点清单」工作台已由全局节点库取代；保留旧实例的说明与退出路径。
    if (props.instance.type === "graph-table") {
        return (
            <EmptyState
                title="节点清单已由节点库取代"
                description="在画布中右键节点可创建预设，或用「视图 → 节点库」打开插入菜单。此实例可以从工作台菜单删除。"
            />
        );
    }

    const definition = getWorkbench(props.instance.type);

    if (definition === undefined) {
        return (
            <EmptyState
                title="未知工作台类型"
                description={`实例 ${props.instance.id} 使用了未注册的 type：${props.instance.type}`}
            />
        );
    }

    if (!definition.canOpen(props.instance)) {
        return (
            <EmptyState
                title="工作台实例不兼容"
                description={`${definition.title} 无法打开该实例（缺少图或版本不匹配）。`}
            />
        );
    }

    const View =
        props.mode === "run" && definition.RunView !== undefined
            ? definition.RunView
            : definition.View;
    return (
        <>
            <View {...props} />
            {panelLayer}
        </>
    );
}

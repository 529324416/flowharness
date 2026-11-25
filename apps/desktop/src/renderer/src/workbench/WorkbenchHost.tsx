import type { ReactElement, ReactNode } from "react";
import { EmptyState } from "../ui";
import { getWorkbench } from "./registry";
import type { WorkbenchViewProps } from "./types";

export type WorkbenchHostProps = WorkbenchViewProps & {
    /** 工作台壳层提供的浮动面板层（运行结果 / 会话历史 / 属性等）。 */
    panelLayer?: ReactNode;
};

/** 工作台宿主：按实例 type 选择定义并渲染 View。 */
export function WorkbenchHost({
    panelLayer,
    ...props
}: WorkbenchHostProps): ReactElement {
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

    const View = definition.View;
    return (
        <>
            <View {...props} />
            {panelLayer}
        </>
    );
}

import type { ReactElement } from "react";
import { CanvasView } from "../canvas/view/CanvasView";

/** 设计器视图：React Flow 受控画布。 */
export function DesignerView({ sessionTitle }: { sessionTitle?: string }): ReactElement {
    return <CanvasView sessionTitle={sessionTitle} />;
}

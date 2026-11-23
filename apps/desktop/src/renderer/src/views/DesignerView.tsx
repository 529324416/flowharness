import type { ReactElement } from "react";
import { CanvasPreview } from "../canvas-preview/CanvasPreview";

/** 设计器视图：Phase 2.5 为静态视觉样张，Phase 3 接入真实画布。 */
export function DesignerView(): ReactElement {
    return <CanvasPreview />;
}

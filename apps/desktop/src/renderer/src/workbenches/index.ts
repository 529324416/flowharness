import { registerWorkbench } from "../workbench/registry";
import { harnessDesignerWorkbench } from "./harness-designer";
import { planRunnerWorkbench } from "./plan-runner";

registerWorkbench(harnessDesignerWorkbench);
registerWorkbench(planRunnerWorkbench);

export {
    harnessDesignerWorkbench,
    planRunnerWorkbench,
};

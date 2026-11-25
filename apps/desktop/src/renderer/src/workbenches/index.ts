import { registerWorkbench } from "../workbench/registry";
import { flowRunnerWorkbench } from "./flow-runner";
import { graphTableWorkbench } from "./graph-table";
import { harnessDesignerWorkbench } from "./harness-designer";
import { planRunnerWorkbench } from "./plan-runner";

registerWorkbench(harnessDesignerWorkbench);
registerWorkbench(graphTableWorkbench);
registerWorkbench(planRunnerWorkbench);
registerWorkbench(flowRunnerWorkbench);

export {
    flowRunnerWorkbench,
    graphTableWorkbench,
    harnessDesignerWorkbench,
    planRunnerWorkbench,
};

import { registerWorkbench } from "../workbench/registry";
import { graphTableWorkbench } from "./graph-table";
import { harnessDesignerWorkbench } from "./harness-designer";
import { planRunnerWorkbench } from "./plan-runner";

registerWorkbench(harnessDesignerWorkbench);
registerWorkbench(graphTableWorkbench);
registerWorkbench(planRunnerWorkbench);

export { graphTableWorkbench, harnessDesignerWorkbench, planRunnerWorkbench };

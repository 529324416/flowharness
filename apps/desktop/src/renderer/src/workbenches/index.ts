import { registerWorkbench } from "../workbench/registry";
import { graphTableWorkbench } from "./graph-table";
import { harnessDesignerWorkbench } from "./harness-designer";

registerWorkbench(harnessDesignerWorkbench);
registerWorkbench(graphTableWorkbench);

export { graphTableWorkbench, harnessDesignerWorkbench };

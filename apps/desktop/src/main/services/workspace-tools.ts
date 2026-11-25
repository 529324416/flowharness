import { ToolRegistry } from "wireclaw";
import { LocalToolProvider } from "wireclaw/client";

/** 每个工作区一套工具：文件读写被限制在工作区根目录内。 */
export function createWorkspaceToolRegistry(
    rootDir: string,
    providerId = "workspace",
): ToolRegistry {
    const registry = new ToolRegistry();
    registry.registerProvider(
        new LocalToolProvider(rootDir, {
            id: providerId,
            name: "Workspace Tools",
            description: "当前工作区的只读文件工具与需审批的写文件工具",
        }),
    );
    return registry;
}

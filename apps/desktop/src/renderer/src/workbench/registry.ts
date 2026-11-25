import type { WorkbenchDefinition } from "./types";

const definitions = new Map<string, WorkbenchDefinition>();

export function registerWorkbench(definition: WorkbenchDefinition): void {
    if (definitions.has(definition.type)) {
        throw new Error(`workbench type already registered: ${definition.type}`);
    }
    definitions.set(definition.type, definition);
}

export function getWorkbench(type: string): WorkbenchDefinition | undefined {
    return definitions.get(type);
}

export function listWorkbenchDefinitions(): readonly WorkbenchDefinition[] {
    return [...definitions.values()];
}

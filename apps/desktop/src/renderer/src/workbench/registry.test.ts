import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { getWorkbenchNavigation, registerWorkbench } from "./registry";
import type { WorkbenchNavigationProps, WorkbenchViewProps } from "./types";

const TestNavigation = (() => null) as unknown as ComponentType<
    WorkbenchNavigationProps
>;
const TestView = (() => null) as unknown as ComponentType<WorkbenchViewProps>;
const RunNavigation = (() => null) as unknown as ComponentType<
    WorkbenchNavigationProps
>;

registerWorkbench({
    type: "test-navigation",
    title: "Test",
    description: "navigation contract test",
    canOpen: () => true,
    navigation: { design: TestNavigation, run: RunNavigation },
    View: TestView,
});

describe("workbench navigation registry", () => {
    it("resolves navigation by workbench type and mode", () => {
        expect(getWorkbenchNavigation("test-navigation", "design")).toBe(
            TestNavigation,
        );
        expect(getWorkbenchNavigation("test-navigation", "run")).toBe(
            RunNavigation,
        );
        expect(getWorkbenchNavigation("missing", "design")).toBeUndefined();
    });
});

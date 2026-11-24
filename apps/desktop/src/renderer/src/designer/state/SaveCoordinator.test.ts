import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphDocument } from "wireclaw";
import { MAIN_GRAPH_TEMPLATE } from "../core/document";
import {
    SaveCoordinator,
    type SaveOutcome,
    type SaveState,
} from "./SaveCoordinator";

const documentA = structuredClone(MAIN_GRAPH_TEMPLATE);
const documentB: GraphDocument = {
    ...structuredClone(MAIN_GRAPH_TEMPLATE),
    title: "Edited",
};

function collectStates(): {
    states: SaveState[];
    onState: (state: SaveState) => void;
} {
    const states: SaveState[] = [];
    return { states, onState: (state) => states.push(state) };
}

describe("SaveCoordinator", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("debounces updates and saves with the current revision", async () => {
        const { states, onState } = collectStates();
        const save = vi.fn(async (): Promise<SaveOutcome> => ({
            ok: true,
            revision: "sha256:2",
        }));
        const coordinator = new SaveCoordinator(
            documentA,
            "sha256:1",
            save,
            onState,
        );

        coordinator.update(documentB);
        expect(states.at(-1)).toEqual({ status: "pending", error: null });

        await vi.advanceTimersByTimeAsync(400);
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith(documentB, "sha256:1");
        expect(states.at(-1)).toEqual({ status: "saved", error: null });

        coordinator.dispose();
    });

    it("stops on conflict and ignores later edits", async () => {
        const { states, onState } = collectStates();
        const save = vi.fn(async (): Promise<SaveOutcome> => ({
            ok: false,
            code: "E_CONFLICT",
            message: "document was modified",
        }));
        const coordinator = new SaveCoordinator(
            documentA,
            "sha256:1",
            save,
            onState,
        );

        coordinator.update(documentB);
        await vi.advanceTimersByTimeAsync(400);
        expect(states.at(-1)).toEqual({
            status: "conflict",
            error: "document was modified",
        });

        coordinator.update(documentA);
        await vi.advanceTimersByTimeAsync(400);
        expect(save).toHaveBeenCalledTimes(1);
        coordinator.dispose();
    });

    it("flushes immediately and serializes saves", async () => {
        const { onState } = collectStates();
        const outcomes: SaveOutcome[] = [
            { ok: true, revision: "sha256:2" },
            { ok: true, revision: "sha256:3" },
        ];
        const save = vi.fn(async (): Promise<SaveOutcome> => {
            const outcome = outcomes.shift();
            if (outcome === undefined) throw new Error("unexpected save");
            return outcome;
        });
        const coordinator = new SaveCoordinator(
            documentA,
            "sha256:1",
            save,
            onState,
        );

        coordinator.update(documentB);
        await coordinator.flush();
        expect(save).toHaveBeenCalledTimes(1);

        coordinator.update(documentA);
        await coordinator.flush();
        expect(save).toHaveBeenCalledTimes(2);

        coordinator.dispose();
    });

    it("reports non-conflict failures and can retry via flush", async () => {
        const { states, onState } = collectStates();
        const save = vi
            .fn<() => Promise<SaveOutcome>>()
            .mockResolvedValueOnce({
                ok: false,
                code: "E_IO",
                message: "disk unavailable",
            })
            .mockResolvedValueOnce({ ok: true, revision: "sha256:2" });
        const coordinator = new SaveCoordinator(
            documentA,
            "sha256:1",
            save,
            onState,
        );

        coordinator.update(documentB);
        await vi.advanceTimersByTimeAsync(400);
        expect(states.at(-1)).toEqual({
            status: "error",
            error: "disk unavailable",
        });

        await coordinator.flush();
        expect(save).toHaveBeenCalledTimes(2);
        expect(states.at(-1)).toEqual({ status: "saved", error: null });
        coordinator.dispose();
    });
});

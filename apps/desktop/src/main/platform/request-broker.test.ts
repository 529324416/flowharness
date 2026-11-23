import { describe, expect, it } from "vitest";
import { RequestBroker } from "./request-broker";

describe("RequestBroker", () => {
    it("resolves with the settled value", async () => {
        const broker = new RequestBroker<string>(1000, () => "timeout");
        const pending = broker.wait("req_1");

        expect(broker.settle("req_1", "approve")).toBe(true);
        await expect(pending).resolves.toBe("approve");
        expect(broker.settle("req_1", "deny")).toBe(false);
    });

    it("falls back to the timeout value", async () => {
        const broker = new RequestBroker<string>(20, (requestId) => `timeout:${requestId}`);
        await expect(broker.wait("req_2")).resolves.toBe("timeout:req_2");
        expect(broker.size).toBe(0);
    });
});

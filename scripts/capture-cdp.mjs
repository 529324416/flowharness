import { writeFileSync } from "node:fs";

const port = process.argv[2] ?? "9333";
const out = process.argv[3];

if (!out) {
    console.error("usage: node capture-cdp.mjs <port> <out.png>");
    process.exit(1);
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
    ]);
}

const targets = await withTimeout(
    fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json()),
    5000,
    "targets",
);
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("no page target");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await withTimeout(
    new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    }),
    5000,
    "ws open",
);

let nextId = 1;
function send(method, params = {}) {
    const id = nextId++;
    return withTimeout(
        new Promise((resolve, reject) => {
            const onMessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.id !== id) return;
                socket.removeEventListener("message", onMessage);
                if (message.error) reject(new Error(JSON.stringify(message.error)));
                else resolve(message.result);
            };
            socket.addEventListener("message", onMessage);
            socket.send(JSON.stringify({ id, method, params }));
        }),
        10000,
        method,
    );
}

try {
    await send("Page.enable");
    const result = await send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
    });
    writeFileSync(out, Buffer.from(result.data, "base64"));
    console.log(`captured: ${out}`);
} finally {
    socket.close();
}

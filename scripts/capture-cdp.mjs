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

    // Optional deterministic UI state for visual baselines:
    // designer (panels open) | canvas (panels closed) | styleguide | styleguide-nodes.
    const scenario = process.env.FH_CAPTURE_SCENARIO;
    const evaluate = (expression) =>
        send("Runtime.evaluate", { expression, userGesture: true });
    const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    if (scenario === "designer" || scenario === "canvas" || scenario === "canvas-zoom") {
        await evaluate(`document.querySelector('[data-session-id]')?.click()`);
        await settle(600);
        if (scenario === "canvas") {
            await evaluate(
                `const close = (label) => { const button = document.querySelector(\`button[aria-label="\${label}"]\`); if (button?.getAttribute('aria-pressed') === 'true') button.click(); };` +
                    `close('切换属性检查'); close('切换运行日志');`,
            );
            await settle(400);
        }
        if (scenario === "canvas-zoom") {
            for (let step = 0; step < 2; step += 1) {
                await send("Input.dispatchMouseEvent", {
                    type: "mouseWheel",
                    x: 760,
                    y: 420,
                    deltaX: 0,
                    deltaY: 360,
                });
                await settle(180);
            }
            await settle(300);
            const width = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('.react-flow__node')?.getBoundingClientRect().width",
                returnByValue: true,
            });
            console.log(`node screen width: ${width.result?.value}`);
        }
    } else if (scenario === "styleguide") {
        await evaluate(`document.querySelector('button[aria-label="样式指南"]')?.click()`);
        await settle(400);
    } else if (scenario === "input-focus") {
        await evaluate(
            `document.querySelector('input[aria-label="搜索会话"]')?.focus()`,
        );
        await settle(200);
    } else if (scenario === "styleguide-nodes") {
        await evaluate(`document.querySelector('button[aria-label="样式指南"]')?.click()`);
        await settle(400);
        await evaluate(
            `[...document.querySelectorAll('h2')].find((node) => node.textContent === '画布节点')?.scrollIntoView({ block: 'center' })`,
        );
        await settle(300);
    } else if (scenario) {
        throw new Error(`unknown FH_CAPTURE_SCENARIO: ${scenario}`);
    }

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

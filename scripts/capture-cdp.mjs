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
    // designer (panels open) | designer-run (run once) | canvas (panels closed) |
    // canvas-zoom | styleguide | styleguide-nodes | designer-form | designer-library.
    const scenario = process.env.FH_CAPTURE_SCENARIO;
    const evaluate = (expression) =>
        send("Runtime.evaluate", {
            expression,
            userGesture: true,
            returnByValue: true,
        });
    const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clickElement = async (expression) => {
        const rect = await send("Runtime.evaluate", {
            expression: `(() => { const element = ${expression}; if (!element) return null; element.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`,
            returnByValue: true,
        });
        const point = rect.result?.value;
        if (!point) return false;
        await send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: point.x,
            y: point.y,
            button: "left",
            clickCount: 1,
        });
        await send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: point.x,
            y: point.y,
            button: "left",
            clickCount: 1,
        });
        return true;
    };

    const openNodeLibrary = async () => {
        await evaluate(
            `(() => { const pane = document.querySelector('.react-flow__pane'); if (!pane) return false; pane.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 640, clientY: 360, button: 2 })); return true; })()`,
        );
        await settle(300);
        await clickElement(
            `[...document.querySelectorAll('[role="menu"] button')].find((button) => button.textContent?.includes('添加节点'))`,
        );
        await settle(400);
    };

    if (
        scenario === "designer" ||
        scenario === "canvas" ||
        scenario === "canvas-zoom" ||
        scenario === "designer-run" ||
        scenario === "designer-edit" ||
        scenario === "designer-drag" ||
        scenario === "designer-config" ||
        scenario === "designer-form" ||
        scenario === "designer-form-edit" ||
        scenario === "designer-schema" ||
        scenario === "designer-preset" ||
        scenario === "designer-library" ||
        scenario === "designer-menu" ||
        scenario === "designer-recent" ||
        scenario === "designer-panels" ||
        scenario === "designer-select" ||
        scenario === "designer-toggle"
    ) {
        await evaluate(`document.querySelector('[data-session-id]')?.click()`);
        await settle(600);

        // M1.2：设计器按工作区加载；受限环境下先创建一个工作区。
        await evaluate(
            `document.querySelector('button[aria-label="新建工作区"]')?.click()`,
        );
        await settle(2500);

        const nodeCount = await send("Runtime.evaluate", {
            expression: "document.querySelectorAll('.react-flow__node').length",
            returnByValue: true,
        });
        console.log(`node count: ${JSON.stringify(nodeCount.result?.value)}`);

        if (
            scenario === "designer" ||
            scenario === "designer-config" ||
            scenario === "designer-form" ||
            scenario === "designer-form-edit"
        ) {
            await clickElement(
                `document.querySelector('.react-flow__node[data-id="constant"]')`,
            );
            await settle(500);
        }

        if (scenario === "designer-recent") {
            await openNodeLibrary();
            await clickElement(
                `[...document.querySelectorAll('[role="dialog"] button')].find((item) => item.textContent?.includes('文本常量'))`,
            );
            await settle(1200);
            await openNodeLibrary();
            await settle(400);
        }

        if (scenario === "designer-select") {
            await evaluate(
                `[...document.querySelectorAll('.react-flow__node')].find((node) => node.textContent?.includes('Agent Run'))?.click()`,
            );
            await settle(400);
            await evaluate(
                `(() => { const body = document.querySelector('section[aria-label="属性"] > div'); if (body) body.scrollTop = 0; return true; })()`,
            );
            await settle(200);
            await clickElement(
                `[...document.querySelectorAll('section[aria-label="属性"] button')].find((button) => button.textContent?.trim() === '只读')`,
            );
            await settle(400);
        }

        if (scenario === "designer-toggle") {
            await evaluate(
                `[...document.querySelectorAll('.react-flow__node')].find((node) => node.textContent?.includes('Agent Run'))?.click()`,
            );
            await settle(400);
            await clickElement(
                `[...document.querySelectorAll('section[aria-label="属性"] label')].find((label) => label.textContent?.includes('启用思考'))`,
            );
            await settle(400);
        }

        if (scenario === "designer-panels") {
            const sidebar = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('aside[aria-label=\"会话列表\"]')?.getBoundingClientRect().width",
                returnByValue: true,
            });
            const inspector = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('section[aria-label=\"属性\"]')?.getBoundingClientRect().width",
                returnByValue: true,
            });
            console.log(`sidebar width: ${JSON.stringify(sidebar.result?.value)}`);
            console.log(`inspector width: ${JSON.stringify(inspector.result?.value)}`);
            await clickElement(
                `document.querySelector('section[aria-label="属性"] button[aria-label="折叠面板"]')`,
            );
            await settle(400);
            const collapsed = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('section[aria-label=\"属性\"]')?.getBoundingClientRect().height",
                returnByValue: true,
            });
            console.log(`collapsed height: ${JSON.stringify(collapsed.result?.value)}`);
        }

        if (scenario === "designer-menu") {
            await evaluate(
                `(() => { const pane = document.querySelector('.react-flow__pane'); if (!pane) return false; pane.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 640, clientY: 360, button: 2 })); return true; })()`,
            );
            await settle(400);
        }

        if (scenario === "designer-library") {
            await openNodeLibrary();
            await settle(300);
        }

        if (scenario === "designer-preset") {
            await openNodeLibrary();
            await clickElement(
                `[...document.querySelectorAll('[role="dialog"] button')].find((item) => item.textContent?.includes('文本常量'))`,
            );
            await settle(1500);
            const presetCount = await send("Runtime.evaluate", {
                expression: "document.querySelectorAll('.react-flow__node').length",
                returnByValue: true,
            });
            const presetSave = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('footer [data-state]')?.textContent",
                returnByValue: true,
            });
            console.log(
                `preset node count: ${JSON.stringify(presetCount.result?.value)}`,
            );
            console.log(
                `preset save status: ${JSON.stringify(presetSave.result?.value)}`,
            );
        }

        if (scenario === "designer-schema") {
            await clickElement(
                `[...document.querySelectorAll('.react-flow__node')].find((node) => node.textContent?.includes('Agent Run'))`,
            );
            await settle(500);
            await evaluate(
                `(() => { const body = document.querySelector('section[aria-label="属性"] > div'); if (body) body.scrollTop = body.scrollHeight; return true; })()`,
            );
            await settle(300);
        }

        if (scenario === "designer-form") {
            await evaluate(
                `(() => { const body = document.querySelector('section[aria-label="属性"] > div'); if (body) body.scrollTop = body.scrollHeight; return true; })()`,
            );
            await settle(300);
        }

        if (scenario === "designer-form-edit") {
            await evaluate(
                `(() => { const body = document.querySelector('section[aria-label="属性"] > div'); if (body) body.scrollTop = body.scrollHeight; return true; })()`,
            );
            await settle(300);
            const value = JSON.stringify(
                { value: { type: "text", text: "edited from form" } },
                null,
                2,
            );
            const edited = await evaluate(
                `(() => { const area = document.querySelector('section[aria-label="属性"] textarea'); if (!area) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(area, ${JSON.stringify(value)}); area.dispatchEvent(new Event('input', { bubbles: true })); area.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return true; })()`,
            );
            console.log(`form editor found: ${JSON.stringify(edited.result?.value)}`);
            await settle(1500);
            const save = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('footer [data-state]')?.textContent",
                returnByValue: true,
            });
            console.log(`form save status: ${JSON.stringify(save.result?.value)}`);
        }

        if (scenario === "designer-config") {
            await clickElement(
                `[...document.querySelectorAll('button[role="tab"]')].find((button) => button.textContent?.trim() === 'JSON')`,
            );
            await settle(300);
            const config = JSON.stringify(
                { value: { type: "text", text: "edited from inspector" } },
                null,
                2,
            );
            const applied = await evaluate(
                `(() => { const textarea = document.querySelector('textarea[aria-label="节点 config JSON"]'); if (!textarea) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(textarea, ${JSON.stringify(config)}); textarea.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
            );
            console.log(`config editor found: ${JSON.stringify(applied.result?.value)}`);
            await settle(200);
            await evaluate(
                `[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '应用')?.click()`,
            );
            await settle(1500);
            const save = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('footer [data-state]')?.textContent",
                returnByValue: true,
            });
            console.log(`config save status: ${JSON.stringify(save.result?.value)}`);
        }

        if (scenario === "designer-drag") {
            const box = await evaluate(
                `(() => { const node = document.querySelector('.react-flow__node[data-id="constant"]'); if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + 15 }; })()`,
            );
            const point = box.result?.value;
            if (point) {
                await send("Input.dispatchMouseEvent", {
                    type: "mousePressed",
                    x: point.x,
                    y: point.y,
                    button: "left",
                    buttons: 1,
                    clickCount: 1,
                });
                for (let step = 1; step <= 6; step += 1) {
                    await send("Input.dispatchMouseEvent", {
                        type: "mouseMoved",
                        x: point.x + (120 * step) / 6,
                        y: point.y + (80 * step) / 6,
                        button: "left",
                        buttons: 1,
                    });
                    await settle(60);
                }
                await send("Input.dispatchMouseEvent", {
                    type: "mouseReleased",
                    x: point.x + 120,
                    y: point.y + 80,
                    button: "left",
                    buttons: 0,
                    clickCount: 1,
                });
            }
            await settle(1500);
            const save = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('footer [data-state]')?.textContent",
                returnByValue: true,
            });
            console.log(`drag save status: ${JSON.stringify(save.result?.value)}`);
        }

        if (scenario === "designer-edit") {
            await openNodeLibrary();
            await clickElement(
                `[...document.querySelectorAll('[role="dialog"] button')].find((item) => item.textContent?.includes('Constant'))`,
            );
            await settle(1500);
            const edited = await send("Runtime.evaluate", {
                expression: "document.querySelectorAll('.react-flow__node').length",
                returnByValue: true,
            });
            const save = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('footer [data-state]')?.textContent",
                returnByValue: true,
            });
            console.log(`edited node count: ${JSON.stringify(edited.result?.value)}`);
            console.log(`save status: ${JSON.stringify(save.result?.value)}`);
        }

        if (scenario === "designer-run") {
            await evaluate(
                `[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '运行')?.click()`,
            );
            await settle(2500);
            const statuses = await send("Runtime.evaluate", {
                expression:
                    "[...document.querySelectorAll('.react-flow__node [data-status]')].map((node) => node.getAttribute('data-status'))",
                returnByValue: true,
            });
            console.log(`node statuses: ${JSON.stringify(statuses.result?.value)}`);
        }
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
            await settle(900);
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
    } else if (scenario === "styleguide-form") {
        await evaluate(`document.querySelector('button[aria-label="样式指南"]')?.click()`);
        await settle(400);
        await evaluate(
            `[...document.querySelectorAll('h2')].find((node) => node.textContent === '表单控件')?.scrollIntoView({ block: 'center' })`,
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

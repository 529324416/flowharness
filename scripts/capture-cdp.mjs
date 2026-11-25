import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    // designer (panels open) | designer-run (run once) | designer-problems |
    // canvas (panels closed) | canvas-zoom | styleguide | styleguide-nodes |
    // designer-form | designer-library.
    const scenario = process.env.FH_CAPTURE_SCENARIO;
    const evaluate = (expression) =>
        send("Runtime.evaluate", {
            expression,
            userGesture: true,
            returnByValue: true,
        });
    const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const evaluateAsync = (expression) =>
        send("Runtime.evaluate", {
            expression,
            userGesture: true,
            returnByValue: true,
            awaitPromise: true,
        });
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
        scenario === "designer-toggle" ||
        scenario === "designer-problems" ||
        scenario === "designer-documents" ||
        scenario === "designer-doc-flow" ||
        scenario === "designer-workbenches" ||
        scenario === "designer-workbench-flow" ||
        scenario === "designer-workbench-return" ||
        scenario === "designer-plan-runner" ||
        scenario === "designer-workbench-manage" ||
        scenario === "provider-settings" ||
        scenario === "designer-inline" ||
        scenario === "designer-inline-type" ||
        scenario === "designer-slot-connect" ||
        scenario === "designer-import" ||
        scenario === "designer-history" ||
        scenario === "canvas-selection" ||
        scenario === "canvas-selection-stress" ||
        scenario === "canvas-pan"
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

        if (scenario === "designer-documents") {
            await clickElement(`document.querySelector('button[aria-label="切换或管理文档"]')`);
            await settle(500);
        }

        if (scenario === "provider-settings") {
            await clickElement(`document.querySelector('button[aria-label="设置"]')`);
            await settle(250);
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('Provider 设置'))`,
            );
            await settle(800);

            const providers = await evaluateAsync(`(async () => {
                const result = await window.flowharness.listProviders();
                return result.ok ? result.data.map((item) => ({
                    id: item.id,
                    kind: item.kind,
                    enabled: item.enabled,
                    hasKey: item.hasKey,
                    available: item.available,
                    error: item.error ?? null,
                })) : null;
            })()`);
            const dialog = await evaluateAsync(
                `document.querySelector('[role="dialog"]')?.textContent?.slice(0, 240)`,
            );
            console.log(`providers: ${JSON.stringify(providers.result?.value)}`);
            console.log(`provider dialog: ${JSON.stringify(dialog.result?.value)}`);

            // 保存一次配置，验证 UI → config:update → providers:list 的闭环。
            await evaluate(
                `(() => { const cards = [...document.querySelectorAll('[role="dialog"] section')]; const card = cards.find((item) => item.textContent?.includes('deepseek')); const input = card?.querySelector('input[type="checkbox"]'); if (input && !input.checked) input.click(); })()`,
            );
            await settle(150);
            await clickElement(
                `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === '保存配置')`,
            );
            await settle(800);
            const saved = await evaluateAsync(`(async () => {
                const result = await window.flowharness.getConfig();
                return result.ok ? result.data.providers.map((item) => ({ id: item.id, enabled: item.enabled })) : null;
            })()`);
            console.log(`providers saved: ${JSON.stringify(saved.result?.value)}`);
        }

        if (scenario === "designer-workbench-manage") {
            const readWorkbenches = async () => {
                const result = await evaluateAsync(`(async () => {
                    const list = await window.flowharness.listWorkspaces();
                    const workspace = list.ok ? list.data[0] : undefined;
                    if (!workspace) return null;
                    const docs = await window.flowharness.listWorkbenches(workspace.id);
                    return docs.ok ? docs.data.map((item) => ({ id: item.id, title: item.title, type: item.type })) : null;
                })()`);
                return result.result?.value;
            };

            await clickElement(`document.querySelector('button[aria-label="切换或新建工作台"]')`);
            await settle(250);
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('重命名当前工作台'))`,
            );
            await settle(350);
            await evaluate(
                `(() => { const input = document.querySelector('[role="dialog"] input'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'M5 工作台'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
            );
            await settle(150);
            await clickElement(
                `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === '保存')`,
            );
            await settle(1000);
            console.log(`workbench rename: ${JSON.stringify(await readWorkbenches())}`);

            await clickElement(`document.querySelector('button[aria-label="切换或新建工作台"]')`);
            await settle(250);
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('删除当前工作台'))`,
            );
            await settle(350);
            await clickElement(
                `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === '删除')`,
            );
            await settle(1200);
            console.log(`workbench delete: ${JSON.stringify(await readWorkbenches())}`);
        }

        if (scenario === "designer-plan-runner") {
            // 先建第二份图，让计划有两个步骤。
            await clickElement(`document.querySelector('button[aria-label="切换或管理文档"]')`);
            await settle(250);
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('新建文档'))`,
            );
            await settle(1200);

            await clickElement(`document.querySelector('button[aria-label="切换或新建工作台"]')`);
            await settle(250);
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('批量运行'))`,
            );
            await settle(1000);

            // 选中全部图。
            await evaluate(
                `[...document.querySelectorAll('input[type="checkbox"]')].forEach((input) => { if (!input.checked) input.click(); })`,
            );
            await settle(200);
            await clickElement(
                `[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '运行计划')`,
            );
            await settle(3000);

            const steps = await send("Runtime.evaluate", {
                expression:
                    "[...document.querySelectorAll('ol[class*=\\\"steps\\\"] li')].map((item) => item.textContent?.trim())",
                returnByValue: true,
            });
            const trigger = await evaluateAsync(
                `document.querySelector('button[aria-label="切换或新建工作台"]')?.textContent?.trim()`,
            );
            console.log(`plan steps: ${JSON.stringify(steps.result?.value)}`);
            console.log(`plan workbench: ${JSON.stringify(trigger.result?.value)}`);
        }

        if (scenario === "designer-workbench-return") {
            await clickElement(`document.querySelector('button[aria-label="切换或新建工作台"]')`);
            await settle(300);
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('节点清单'))`,
            );
            await settle(1500);

            await clickElement(`document.querySelector('button[aria-label="切换或新建工作台"]')`);
            await settle(300);
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('主工作台'))`,
            );
            await settle(1800);

            const trigger = await evaluateAsync(
                `document.querySelector('button[aria-label="切换或新建工作台"]')?.textContent?.trim()`,
            );
            const nodes = await send("Runtime.evaluate", {
                expression: "document.querySelectorAll('.react-flow__node').length",
                returnByValue: true,
            });
            const panels = await send("Runtime.evaluate", {
                expression: "document.querySelectorAll('section[aria-label=\\\"属性\\\"]').length",
                returnByValue: true,
            });
            console.log(
                `workbench return: ${JSON.stringify(trigger.result?.value)} / nodes=${String(nodes.result?.value)} / panels=${String(panels.result?.value)}`,
            );
        }

        if (scenario === "designer-slot-connect") {
            const points = await send("Runtime.evaluate", {
                expression: `(() => {
                    const source = document.querySelector('.react-flow__node[data-id="constant"]');
                    if (!source) return null;
                    const handle = source.querySelector('.react-flow__handle.source');
                    const slot = document.querySelector('[data-node-id="output"] [data-input-port="json"]');
                    if (!handle || !slot) return null;
                    const h = handle.getBoundingClientRect();
                    const s = slot.getBoundingClientRect();
                    return {
                        from: { x: h.x + h.width / 2, y: h.y + h.height / 2 },
                        to: { x: s.x + s.width / 2, y: s.y + s.height / 2 },
                    };
                })()`,
                returnByValue: true,
            });
            const point = points.result?.value;
            if (point) {
                await send("Input.dispatchMouseEvent", {
                    type: "mousePressed",
                    x: point.from.x,
                    y: point.from.y,
                    button: "left",
                    buttons: 1,
                    clickCount: 1,
                });
                for (let step = 1; step <= 8; step += 1) {
                    await send("Input.dispatchMouseEvent", {
                        type: "mouseMoved",
                        x: point.from.x + ((point.to.x - point.from.x) * step) / 8,
                        y: point.from.y + ((point.to.y - point.from.y) * step) / 8,
                        button: "left",
                        buttons: 1,
                    });
                    await settle(40);
                }
                await send("Input.dispatchMouseEvent", {
                    type: "mouseReleased",
                    x: point.to.x,
                    y: point.to.y,
                    button: "left",
                    buttons: 0,
                    clickCount: 1,
                });
                await settle(1200);
            } else {
                console.log("slot connect: points not found");
            }

            const edges = await evaluateAsync(`(async () => {
                const list = await window.flowharness.listWorkspaces();
                const workspace = list.ok ? list.data[0] : undefined;
                if (!workspace) return null;
                const snapshot = await window.flowharness.readDocument(workspace.id, { kind: 'harness', id: 'main' });
                if (!snapshot.ok || snapshot.data === null) return null;
                const graphEdges = snapshot.data.document?.edges;
                return Array.isArray(graphEdges) ? graphEdges : null;
            })()`);
            console.log(`slot connect edges: ${JSON.stringify(edges.result?.value)}`);
        }

        if (scenario === "designer-inline-type") {
            await evaluate(
                `document.querySelector('input[aria-label="常量文本"]')?.focus()`,
            );
            await settle(200);

            for (const char of "hello") {
                const code = `Key${char.toUpperCase()}`;
                await send("Input.dispatchKeyEvent", {
                    type: "keyDown",
                    key: char,
                    code,
                    text: char,
                    unmodifiedText: char,
                    windowsVirtualKeyCode: char.toUpperCase().charCodeAt(0),
                });
                await send("Input.dispatchKeyEvent", {
                    type: "keyUp",
                    key: char,
                    code,
                    windowsVirtualKeyCode: char.toUpperCase().charCodeAt(0),
                });
                await settle(60);
            }
            await settle(1200);

            const domValue = await evaluateAsync(
                `document.querySelector('input[aria-label="常量文本"]')?.value`,
            );
            const config = await evaluateAsync(`(async () => {
                const list = await window.flowharness.listWorkspaces();
                const workspace = list.ok ? list.data[0] : undefined;
                if (!workspace) return null;
                const snapshot = await window.flowharness.readDocument(workspace.id, { kind: 'harness', id: 'main' });
                if (!snapshot.ok || snapshot.data === null) return null;
                const nodes = snapshot.data.document?.nodes;
                return Array.isArray(nodes) ? nodes.find((node) => node.id === 'constant')?.config : null;
            })()`);
            console.log(`inline typed value: ${JSON.stringify(domValue.result?.value)}`);
            console.log(`inline typed config: ${JSON.stringify(config.result?.value)}`);
        }

        if (scenario === "designer-inline") {
            const changed = await evaluate(
                `(() => { const input = document.querySelector('input[aria-label="常量文本"]'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'inline edited'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
            );
            await settle(1200);

            const config = await evaluateAsync(`(async () => {
                const list = await window.flowharness.listWorkspaces();
                const workspace = list.ok ? list.data[0] : undefined;
                if (!workspace) return null;
                const snapshot = await window.flowharness.readDocument(workspace.id, { kind: 'harness', id: 'main' });
                if (!snapshot.ok || snapshot.data === null) return null;
                const nodes = snapshot.data.document?.nodes;
                return Array.isArray(nodes) ? nodes.find((node) => node.id === 'constant')?.config : null;
            })()`);
            const save = await evaluateAsync(
                `document.querySelector('footer [data-state]')?.textContent`,
            );
            console.log(`inline changed: ${JSON.stringify(changed.result?.value)}`);
            console.log(`inline config: ${JSON.stringify(config.result?.value)}`);
            console.log(`inline save: ${JSON.stringify(save.result?.value)}`);
        }

        if (scenario === "designer-import") {
            const fixture = join(tmpdir(), `fh-import-${process.pid}.json`);
            writeFileSync(
                fixture,
                `${JSON.stringify({
                    version: 1,
                    id: "imported",
                    title: "导入测试",
                    nodes: [
                        {
                            id: "importedConstant",
                            type: "core.constant",
                            typeVersion: 1,
                            config: { value: { type: "text", text: "imported" } },
                            ui: { x: 120, y: 140 },
                        },
                        {
                            id: "importedOutput",
                            type: "core.output",
                            typeVersion: 1,
                            ui: { x: 480, y: 140 },
                        },
                    ],
                    edges: [
                        {
                            from: { nodeId: "importedConstant", port: "value" },
                            to: { nodeId: "importedOutput", port: "text" },
                        },
                    ],
                })}\n`,
            );

            const root = await send("DOM.getDocument", { depth: -1 });
            const input = await send("DOM.querySelector", {
                nodeId: root.root.nodeId,
                selector: 'input[type="file"]',
            });
            if (input.nodeId === 0) {
                console.log("import input: not found");
            } else {
                await send("DOM.setFileInputFiles", {
                    files: [fixture],
                    nodeId: input.nodeId,
                });
                await settle(1500);
            }

            const documents = await evaluateAsync(`(async () => {
                const list = await window.flowharness.listWorkspaces();
                const workspace = list.ok ? list.data[0] : undefined;
                if (!workspace) return null;
                const result = await window.flowharness.listDocuments(workspace.id);
                return result.ok ? result.data.map((document) => document.title) : null;
            })()`);
            const trigger = await evaluateAsync(
                `document.querySelector('button[aria-label="切换或管理文档"]')?.textContent?.trim()`,
            );
            console.log(`import documents: ${JSON.stringify(documents.result?.value)} / ${JSON.stringify(trigger.result?.value)}`);
        }

        if (scenario === "designer-history") {
            const box = await send("Runtime.evaluate", {
                expression: `(() => {
                    const nodes = [...document.querySelectorAll('.react-flow__node')];
                    if (nodes.length < 2) return null;
                    const rects = nodes.map((node) => node.getBoundingClientRect());
                    return {
                        x1: Math.min(...rects.map((rect) => rect.left)) - 60,
                        y1: Math.min(...rects.map((rect) => rect.top)) - 50,
                        x2: Math.max(...rects.map((rect) => rect.right)) + 40,
                        y2: Math.max(...rects.map((rect) => rect.bottom)) + 40,
                    };
                })()`,
                returnByValue: true,
            });
            const point = box.result?.value;
            if (point) {
                await send("Input.dispatchMouseEvent", {
                    type: "mousePressed",
                    x: point.x1,
                    y: point.y1,
                    button: "left",
                    buttons: 1,
                    clickCount: 1,
                });
                for (let step = 1; step <= 8; step += 1) {
                    await send("Input.dispatchMouseEvent", {
                        type: "mouseMoved",
                        x: point.x1 + ((point.x2 - point.x1) * step) / 8,
                        y: point.y1 + ((point.y2 - point.y1) * step) / 8,
                        button: "left",
                        buttons: 1,
                    });
                    await settle(30);
                }
                await send("Input.dispatchMouseEvent", {
                    type: "mouseReleased",
                    x: point.x2,
                    y: point.y2,
                    button: "left",
                    buttons: 0,
                    clickCount: 1,
                });
                await settle(300);
            }

            const press = async (key, shift = false) => {
                await evaluate(
                    `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ctrlKey: true, shiftKey: ${String(shift)}, bubbles: true }))`,
                );
                await settle(400);
            };
            const count = async () => {
                const result = await send("Runtime.evaluate", {
                    expression: "document.querySelectorAll('.react-flow__node').length",
                    returnByValue: true,
                });
                return result.result?.value;
            };

            console.log(`history initial: ${JSON.stringify(await count())}`);
            await press("c");
            await press("v");
            console.log(`history after paste: ${JSON.stringify(await count())}`);
            await press("z");
            console.log(`history after undo: ${JSON.stringify(await count())}`);
            await press("y");
            console.log(`history after redo: ${JSON.stringify(await count())}`);
        }

        if (scenario === "designer-workbenches") {
            const workbenches = await evaluateAsync(`(async () => {
                const list = await window.flowharness.listWorkspaces();
                const workspace = list.ok ? list.data[0] : undefined;
                if (!workspace) return null;
                const result = await window.flowharness.listWorkbenches(workspace.id);
                return result.ok ? result.data.map((item) => ({ id: item.id, title: item.title, type: item.type })) : null;
            })()`);
            console.log(`workbenches: ${JSON.stringify(workbenches.result?.value)}`);

            await clickElement(`document.querySelector('button[aria-label="切换或新建工作台"]')`);
            await settle(500);
        }

        if (scenario === "designer-workbench-flow") {
            await clickElement(`document.querySelector('button[aria-label="切换或新建工作台"]')`);
            await settle(300);
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('节点清单'))`,
            );
            await settle(1800);

            const workbenches = await evaluateAsync(`(async () => {
                const list = await window.flowharness.listWorkspaces();
                const workspace = list.ok ? list.data[0] : undefined;
                if (!workspace) return null;
                const result = await window.flowharness.listWorkbenches(workspace.id);
                return result.ok ? result.data.map((item) => ({ id: item.id, title: item.title, type: item.type })) : null;
            })()`);
            const trigger = await evaluateAsync(
                `document.querySelector('button[aria-label="切换或新建工作台"]')?.textContent?.trim()`,
            );
            const rows = await send("Runtime.evaluate", {
                expression: "document.querySelectorAll('table tbody tr').length",
                returnByValue: true,
            });
            console.log(
                `workbench flow: ${JSON.stringify(workbenches.result?.value)} / ${JSON.stringify(trigger.result?.value)} / rows=${String(rows.result?.value)}`,
            );
        }

        if (scenario === "designer-doc-flow") {
            const readDocuments = async () => {
                const result = await evaluateAsync(`(async () => {
                    const list = await window.flowharness.listWorkspaces();
                    const workspace = list.ok ? list.data[0] : undefined;
                    if (!workspace) return null;
                    const documents = await window.flowharness.listDocuments(workspace.id);
                    return documents.ok ? documents.data.map((document) => ({ id: document.id, title: document.title })) : null;
                })()`);
                return result.result?.value;
            };
            const triggerText = async () => {
                const result = await evaluateAsync(
                    `document.querySelector('button[aria-label="切换或管理文档"]')?.textContent?.trim()`,
                );
                return result.result?.value;
            };
            const openMenu = async () => {
                await clickElement(
                    `document.querySelector('button[aria-label="切换或管理文档"]')`,
                );
                await settle(300);
            };

            console.log(`doc flow initial: ${JSON.stringify(await readDocuments())}`);

            await openMenu();
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('新建文档'))`,
            );
            await settle(1200);
            console.log(`doc flow after create: ${JSON.stringify(await readDocuments())} / ${JSON.stringify(await triggerText())}`);

            await openMenu();
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('重命名'))`,
            );
            await settle(400);
            await evaluate(
                `(() => { const input = document.querySelector('[role="dialog"] input'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'M4 重命名'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
            );
            await settle(200);
            await clickElement(
                `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === '保存')`,
            );
            await settle(1200);
            console.log(`doc flow after rename: ${JSON.stringify(await readDocuments())} / ${JSON.stringify(await triggerText())}`);

            await openMenu();
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('复制当前文档'))`,
            );
            await settle(1200);
            console.log(`doc flow after duplicate: ${JSON.stringify(await readDocuments())} / ${JSON.stringify(await triggerText())}`);

            await openMenu();
            await clickElement(
                `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.includes('删除当前文档'))`,
            );
            await settle(400);
            await clickElement(
                `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === '删除')`,
            );
            await settle(1200);
            console.log(`doc flow after delete: ${JSON.stringify(await readDocuments())} / ${JSON.stringify(await triggerText())}`);
        }

        if (scenario === "canvas-selection") {
            const box = await send("Runtime.evaluate", {
                expression: `(() => {
                    const nodes = [...document.querySelectorAll('.react-flow__node')];
                    if (nodes.length < 2) return null;
                    const rects = nodes.map((node) => node.getBoundingClientRect());
                    return {
                        x1: Math.min(...rects.map((rect) => rect.left)) - 60,
                        y1: Math.min(...rects.map((rect) => rect.top)) - 50,
                        x2: Math.max(...rects.map((rect) => rect.right)) + 40,
                        y2: Math.max(...rects.map((rect) => rect.bottom)) + 40,
                    };
                })()`,
                returnByValue: true,
            });
            const point = box.result?.value;
            if (point) {
                await send("Input.dispatchMouseEvent", {
                    type: "mousePressed",
                    x: point.x1,
                    y: point.y1,
                    button: "left",
                    buttons: 1,
                    clickCount: 1,
                });
                for (let step = 1; step <= 8; step += 1) {
                    await send("Input.dispatchMouseEvent", {
                        type: "mouseMoved",
                        x: point.x1 + ((point.x2 - point.x1) * step) / 8,
                        y: point.y1 + ((point.y2 - point.y1) * step) / 8,
                        button: "left",
                        buttons: 1,
                    });
                    await settle(40);
                }
                await send("Input.dispatchMouseEvent", {
                    type: "mouseReleased",
                    x: point.x2,
                    y: point.y2,
                    button: "left",
                    buttons: 0,
                    clickCount: 1,
                });
                await settle(500);
            } else {
                console.log("selection box: no nodes found");
            }

            const selected = await send("Runtime.evaluate", {
                expression: "document.querySelectorAll('.react-flow__node.selected').length",
                returnByValue: true,
            });
            console.log(`selected nodes: ${JSON.stringify(selected.result?.value)}`);
        }

        if (scenario === "canvas-selection-stress") {
            const box = await send("Runtime.evaluate", {
                expression: `(() => {
                    const nodes = [...document.querySelectorAll('.react-flow__node')];
                    if (nodes.length < 2) return null;
                    const rects = nodes.map((node) => node.getBoundingClientRect());
                    return {
                        x1: Math.min(...rects.map((rect) => rect.left)) - 60,
                        y1: Math.min(...rects.map((rect) => rect.top)) - 50,
                        x2: Math.max(...rects.map((rect) => rect.right)) + 40,
                        y2: Math.max(...rects.map((rect) => rect.bottom)) + 40,
                    };
                })()`,
                returnByValue: true,
            });
            const point = box.result?.value;
            for (let round = 0; round < 8 && point; round += 1) {
                await send("Input.dispatchMouseEvent", {
                    type: "mousePressed",
                    x: point.x1,
                    y: point.y1,
                    button: "left",
                    buttons: 1,
                    clickCount: 1,
                });
                for (let step = 1; step <= 6; step += 1) {
                    await send("Input.dispatchMouseEvent", {
                        type: "mouseMoved",
                        x: point.x1 + ((point.x2 - point.x1) * step) / 6,
                        y: point.y1 + ((point.y2 - point.y1) * step) / 6,
                        button: "left",
                        buttons: 1,
                    });
                    await settle(25);
                }
                await send("Input.dispatchMouseEvent", {
                    type: "mouseReleased",
                    x: point.x2,
                    y: point.y2,
                    button: "left",
                    buttons: 0,
                    clickCount: 1,
                });
                await settle(120);

                const roundSelected = await send("Runtime.evaluate", {
                    expression: "document.querySelectorAll('.react-flow__node.selected').length",
                    returnByValue: true,
                });
                console.log(
                    `stress round ${round}: selected=${String(roundSelected.result?.value)}`,
                );
                await settle(400);
                const stableSelected = await send("Runtime.evaluate", {
                    expression: "document.querySelectorAll('.react-flow__node.selected').length",
                    returnByValue: true,
                });
                if (stableSelected.result?.value !== roundSelected.result?.value) {
                    console.log(
                        `stress round ${round}: unstable ${String(roundSelected.result?.value)} -> ${String(stableSelected.result?.value)}`,
                    );
                }

                await send("Input.dispatchMouseEvent", {
                    type: "mousePressed",
                    x: 980,
                    y: 700,
                    button: "left",
                    buttons: 1,
                    clickCount: 1,
                });
                await send("Input.dispatchMouseEvent", {
                    type: "mouseReleased",
                    x: 980,
                    y: 700,
                    button: "left",
                    buttons: 0,
                    clickCount: 1,
                });
                await settle(80);
            }
            const selected = await send("Runtime.evaluate", {
                expression: "document.querySelectorAll('.react-flow__node.selected').length",
                returnByValue: true,
            });
            console.log(`stress selected: ${JSON.stringify(selected.result?.value)}`);
        }

        if (scenario === "canvas-pan") {
            const before = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('.react-flow__node')?.getBoundingClientRect().left",
                returnByValue: true,
            });
            const start = { x: 720, y: 560 };
            await send("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x: start.x,
                y: start.y,
                button: "right",
                buttons: 2,
                clickCount: 1,
            });
            for (let step = 1; step <= 6; step += 1) {
                await send("Input.dispatchMouseEvent", {
                    type: "mouseMoved",
                    x: start.x + (160 * step) / 6,
                    y: start.y + (90 * step) / 6,
                    button: "right",
                    buttons: 2,
                });
                await settle(40);
            }
            await send("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x: start.x + 160,
                y: start.y + 90,
                button: "right",
                buttons: 0,
                clickCount: 1,
            });
            await settle(400);

            const after = await send("Runtime.evaluate", {
                expression:
                    "document.querySelector('.react-flow__node')?.getBoundingClientRect().left",
                returnByValue: true,
            });
            const menuAfterDrag = await send("Runtime.evaluate", {
                expression: "document.querySelector('.react-flow__pane') ? document.querySelectorAll('[role=\\\"menu\\\"]').length : -1",
                returnByValue: true,
            });
            console.log(`node left before/after: ${JSON.stringify(before.result?.value)} / ${JSON.stringify(after.result?.value)}`);
            console.log(`menu after right drag: ${JSON.stringify(menuAfterDrag.result?.value)}`);

            // 普通右键单击仍应弹出画布菜单。
            await send("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x: 720,
                y: 560,
                button: "right",
                buttons: 2,
                clickCount: 1,
            });
            await send("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x: 720,
                y: 560,
                button: "right",
                buttons: 0,
                clickCount: 1,
            });
            await settle(400);
            const menuAfterClick = await send("Runtime.evaluate", {
                expression:
                    "[...document.querySelectorAll('[role=\\\"menu\\\"] button')].map((button) => button.textContent?.trim())",
                returnByValue: true,
            });
            console.log(`menu after right click: ${JSON.stringify(menuAfterClick.result?.value)}`);
        }

        if (scenario === "designer-problems") {
            // 写入一张内嵌非法子图的文档，重载后从问题面板定位。
            const seeded = await send("Runtime.evaluate", {
                expression: `(async () => {
                    const list = await window.flowharness.listWorkspaces();
                    const workspace = list.ok ? list.data[0] : undefined;
                    if (!workspace) return "no-workspace";
                    const snapshot = await window.flowharness.readDocument(workspace.id, { kind: "harness", id: "main" });
                    const baseRevision = snapshot.ok && snapshot.data ? snapshot.data.revision : null;
                    const document = {
                        version: 1,
                        id: "main",
                        title: "问题演示",
                        nodes: [
                            {
                                id: "subgraph",
                                type: "core.subgraph",
                                typeVersion: 1,
                                config: {
                                    graph: {
                                        version: 1,
                                        id: "inner",
                                        nodes: [
                                            { id: "innerConstant", type: "core.constant", typeVersion: 1, config: { value: { type: "text", text: "hello" } } },
                                            { id: "innerOutput", type: "core.output", typeVersion: 1 },
                                        ],
                                        edges: [
                                            { from: { nodeId: "innerConstant", port: "value" }, to: { nodeId: "innerOutput", port: "missing" } },
                                        ],
                                    },
                                },
                                ui: { x: 180, y: 150 },
                            },
                        ],
                        edges: [],
                        ui: { viewport: { x: 24, y: 28, zoom: 1 } },
                    };
                    const saved = await window.flowharness.saveDocument({
                        workspaceId: workspace.id,
                        ref: { kind: "harness", id: "main" },
                        baseRevision,
                        document,
                    });
                    return saved.ok ? "saved" : saved.error.message;
                })()`,
                awaitPromise: true,
                returnByValue: true,
                userGesture: true,
            });
            console.log(`problem seed: ${JSON.stringify(seeded.result?.value)}`);

            await send("Page.reload", { ignoreCache: true });
            await settle(4000);

            await evaluate(
                `(() => { const panel = document.querySelector('button[aria-label="切换运行日志"]'); if (panel && panel.getAttribute('aria-pressed') !== 'true') panel.click(); return true; })()`,
            );
            await settle(500);
            await clickElement(
                `[...document.querySelectorAll('[role="tab"]')].find((button) => button.textContent?.includes('问题'))`,
            );
            await settle(500);
            await clickElement(`document.querySelector('button[class*="problem"]')`);
            await settle(900);

            const activeTab = await send("Runtime.evaluate", {
                expression:
                    "[...document.querySelectorAll('[role=\"tab\"]')].map((tab) => ({ text: tab.textContent, state: tab.getAttribute('data-state') }))",
                returnByValue: true,
            });
            const total = await send("Runtime.evaluate", {
                expression:
                    "document.querySelectorAll('[class*=\"problemText\"]').length",
                returnByValue: true,
            });
            console.log(`tabs: ${JSON.stringify(activeTab.result?.value)}`);
            console.log(`problem count: ${JSON.stringify(total.result?.value)}`);
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
    } else if (scenario === "diagnostics") {
        await evaluate(
            `document.querySelector('button[aria-label="诊断"]')?.click()`,
        );
        await settle(800);
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

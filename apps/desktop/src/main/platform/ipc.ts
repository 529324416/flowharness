import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
    FhError,
    type FhErrorDto,
    type IpcInvokeContracts,
    type IpcResult,
} from "@flowharness/contracts";

type Handler<C extends keyof IpcInvokeContracts> = (
    request: IpcInvokeContracts[C]["request"],
    event: IpcMainInvokeEvent,
) => IpcInvokeContracts[C]["response"] | Promise<IpcInvokeContracts[C]["response"]>;

/**
 * 统一的 invoke 路由：
 * - 成功 → `{ ok: true, data }`
 * - 领域错误（FhError）→ 保留错误码与消息
 * - 其他异常 → `E_INTERNAL`，原始异常只写 main 日志
 *
 * 参数校验由各 handler 负责；Phase 2 引入统一 schema 校验后收口到这里。
 */
export function registerHandler<C extends keyof IpcInvokeContracts>(
    channel: C,
    handler: Handler<C>,
): void {
    ipcMain.handle(
        channel,
        async (
            event,
            request: unknown,
        ): Promise<IpcResult<IpcInvokeContracts[C]["response"]>> => {
            try {
                const data = await handler(
                    request as IpcInvokeContracts[C]["request"],
                    event,
                );
                return { ok: true, data };
            } catch (error) {
                const dto = toErrorDto(error);
                if (dto.code === "E_INTERNAL") {
                    console.error(`[ipc] ${String(channel)} failed`, error);
                }
                return { ok: false, error: dto };
            }
        },
    );
}

function toErrorDto(error: unknown): FhErrorDto {
    if (error instanceof FhError) {
        return {
            code: error.code,
            message: error.message,
            details: error.details,
        };
    }

    return { code: "E_INTERNAL", message: "Internal error" };
}

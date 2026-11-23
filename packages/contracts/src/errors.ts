/** 跨 IPC 的统一错误码。新增时保持向后兼容，不修改既有语义。 */
export const FH_ERROR_CODES = [
    "E_NOT_FOUND",
    "E_INVALID_ARGUMENT",
    "E_CONFLICT",
    "E_PERMISSION",
    "E_IO",
    "E_MIGRATION",
    "E_RUNTIME",
    "E_CANCELLED",
    "E_TIMEOUT",
    "E_INTERNAL",
] as const;

export type FhErrorCode = (typeof FH_ERROR_CODES)[number];

/** 跨进程错误的传输形态；原始 Error / cause 只留在 main 日志里。 */
export type FhErrorDto = {
    code: FhErrorCode;
    message: string;
    details?: unknown;
    traceId?: string;
};

/** 所有 invoke 通道的统一返回。 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: FhErrorDto };

export function ipcOk<T>(data: T): IpcResult<T> {
    return { ok: true, data };
}

export function ipcFail(
    code: FhErrorCode,
    message: string,
    details?: unknown,
): IpcResult<never> {
    return { ok: false, error: { code, message, details } };
}

export function isFhErrorCode(value: unknown): value is FhErrorCode {
    return typeof value === "string" && (FH_ERROR_CODES as readonly string[]).includes(value);
}

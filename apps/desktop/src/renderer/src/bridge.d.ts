import type { IpcResult, ThemeMode, ThemeSetResponse } from "@flowharness/contracts";

/**
 * preload 暴露给 renderer 的唯一入口。
 * 这里只放白名单能力；不要暴露 ipcRenderer 或 Node API。
 */
interface FlowHarnessBridge {
  readonly platform: string;
  readonly versions: {
    readonly electron: string;
    readonly node: string;
    readonly chrome: string;
  };
  /** 请求 main 同步原生主题（窗口边框、原生菜单）。 */
  readonly setTheme: (theme: ThemeMode) => Promise<IpcResult<ThemeSetResponse>>;
  readonly reportReady: (payload: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    readonly flowharness: FlowHarnessBridge;
  }
}

export {};

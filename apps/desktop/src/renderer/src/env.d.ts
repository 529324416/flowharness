interface FlowHarnessBridge {
  readonly platform: string;
  readonly versions: {
    readonly electron: string;
    readonly node: string;
    readonly chrome: string;
  };
  reportReady: (payload: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    readonly flowharness: FlowHarnessBridge;
  }
}

export {};

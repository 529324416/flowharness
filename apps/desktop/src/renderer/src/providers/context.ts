import { createContext, useContext } from "react";
import type { ProviderLibraryView } from "@flowharness/contracts";

export type ProviderLibraryStatus = "loading" | "ready" | "error";

export type ProviderLibraryApi = {
    view: ProviderLibraryView;
    status: ProviderLibraryStatus;
    error: string | null;
    /** 重新读取 main 的库（IPC 返回只读视图，不含密钥）。 */
    refresh: () => Promise<void>;
};

export const ProviderLibraryContext = createContext<ProviderLibraryApi | null>(
    null,
);

export function useProviderLibrary(): ProviderLibraryApi {
    const value = useContext(ProviderLibraryContext);
    if (value === null) {
        throw new Error("useProviderLibrary must be used inside ProviderLibraryProvider");
    }
    return value;
}

export const EMPTY_PROVIDER_LIBRARY: ProviderLibraryView = {
    keys: [],
    profiles: [],
};

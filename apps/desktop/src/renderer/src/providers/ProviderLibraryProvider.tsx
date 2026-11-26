import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactElement,
    type ReactNode,
} from "react";
import type { ProviderLibraryView } from "@flowharness/contracts";
import {
    EMPTY_PROVIDER_LIBRARY,
    ProviderLibraryContext,
    type ProviderLibraryApi,
    type ProviderLibraryStatus,
} from "./context";

/**
 * 应用级 Provider 库上下文。
 *
 * - 启动时读一次；main 在库变化时广播 `provider` topic，收到后直接替换视图；
 * - renderer 只拿到 profile / key 元数据 / 模型目录 / 健康状态，拿不到密钥。
 */
export function ProviderLibraryProvider({
    children,
}: {
    children: ReactNode;
}): ReactElement {
    const [view, setView] = useState<ProviderLibraryView>(EMPTY_PROVIDER_LIBRARY);
    const [status, setStatus] = useState<ProviderLibraryStatus>("loading");
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async (): Promise<void> => {
        const result = await window.flowharness.getProviderLibrary();
        if (result.ok) {
            setView(result.data);
            setStatus("ready");
            setError(null);
        } else {
            setStatus("error");
            setError(result.error.message);
        }
    }, []);

    useEffect(() => {
        void refresh();
        return window.flowharness.onEvent((envelope) => {
            if (envelope.topic !== "provider") return;
            const payload = envelope.payload as ProviderLibraryView | null;
            if (payload === null) return;
            setView(payload);
            setStatus("ready");
            setError(null);
        });
    }, [refresh]);

    const value = useMemo<ProviderLibraryApi>(
        () => ({ view, status, error, refresh }),
        [error, refresh, status, view],
    );

    return (
        <ProviderLibraryContext.Provider value={value}>
            {children}
        </ProviderLibraryContext.Provider>
    );
}

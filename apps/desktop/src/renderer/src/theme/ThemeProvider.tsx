import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { ResolvedTheme, ThemeMode } from "@flowharness/contracts";

type ThemeContextValue = {
    /** 当前生效主题（`system` 已解析）。 */
    theme: ResolvedTheme;
    /** 配置中的主题模式（保留 system）。 */
    mode: ThemeMode;
    toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ResolvedTheme {
    return document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
}

function resolveMode(mode: ThemeMode): ResolvedTheme {
    if (mode === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
    const [mode, setMode] = useState<ThemeMode>("system");
    const [theme, setTheme] = useState<ResolvedTheme>(readInitialTheme);

    // 启动后读取持久化偏好；首帧仍由 matchMedia 决定，避免闪白。
    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const result = await window.flowharness.getConfig();
            if (cancelled || !result.ok) return;

            setMode(result.data.theme);
            setTheme(resolveMode(result.data.theme));
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        document.documentElement.dataset["theme"] = theme;
        window.localStorage.setItem("fh.theme", theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        const next: ResolvedTheme = theme === "dark" ? "light" : "dark";
        setMode(next);
        setTheme(next);
        // 持久化到 AppConfig；失败只影响下次启动的主题，不阻塞 UI。
        void window.flowharness.updateConfig({ theme: next });
    }, [theme]);

    const value = useMemo<ThemeContextValue>(
        () => ({ theme, mode, toggleTheme }),
        [theme, mode, toggleTheme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used inside <ThemeProvider>");
    }
    return context;
}

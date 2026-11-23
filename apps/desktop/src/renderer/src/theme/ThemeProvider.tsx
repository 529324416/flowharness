import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ResolvedTheme } from "@flowharness/contracts";

type ThemeContextValue = {
  /** 当前生效主题（不含 system，首帧已解析）。 */
  theme: ResolvedTheme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ResolvedTheme {
  return document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [theme, setTheme] = useState<ResolvedTheme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    // 让原生窗口边框/菜单跟随；失败不阻塞 UI（主题仅影响外观）。
    void window.flowharness.setTheme(theme).catch(() => undefined);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggleTheme }),
    [theme, toggleTheme],
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

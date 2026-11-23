/** 轻量 className 组合，避免为一个小工具引入额外依赖。 */
export function cx(...values: Array<string | false | null | undefined>): string {
    return values.filter(Boolean).join(" ");
}

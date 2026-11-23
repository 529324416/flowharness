import { promises as fs } from "node:fs";
import { dirname } from "node:path";

/**
 * 原子写：先写临时文件并 flush，再 rename 覆盖目标。
 * Windows 上 rename 可能被杀软/索引器短暂占用，做有限重试。
 */
export async function writeFileAtomic(
    target: string,
    data: string | Uint8Array,
): Promise<void> {
    await fs.mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    const handle = await fs.open(temp, "w");

    try {
        await handle.writeFile(data);
        await handle.sync();
    } finally {
        await handle.close();
    }

    try {
        for (let attempt = 0; ; attempt += 1) {
            try {
                await fs.rename(temp, target);
                return;
            } catch (error) {
                if (attempt >= 4) throw error;
                await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
            }
        }
    } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
    }
}

/** 读取 JSON；文件不存在返回 undefined，内容非法则抛错（由调用方决定如何降级）。 */
export async function readJsonFile<T>(file: string): Promise<T | undefined> {
    try {
        const text = await fs.readFile(file, "utf8");
        return JSON.parse(text) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
    }
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
    await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** 判断 pid 是否仍存活；无权限查询时按存活处理，避免误抢锁。 */
export function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
}

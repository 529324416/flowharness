import { protocol } from "electron";

/**
 * 自定义协议：`fh-asset://<workspaceId>/<contentHash>`。
 * 渲染进程用 `<img src>` 等方式直接读取 Blob，不必把字节塞进 IPC。
 */
export const ASSET_SCHEME = "fh-asset";

const HASH_PATTERN = /^[a-f0-9]{64}$/;

export type AssetSource = {
    bytes: Uint8Array;
    mimeType: string;
};

export type AssetResolver = (
    workspaceId: string,
    contentHash: string,
) => Promise<AssetSource | undefined>;

/** 必须在 app ready 之前调用。 */
export function registerAssetScheme(): void {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: ASSET_SCHEME,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                stream: true,
            },
        },
    ]);
}

/** 必须在 app ready 之后调用。 */
export function registerAssetProtocol(resolve: AssetResolver): void {
    protocol.handle(ASSET_SCHEME, async (request) => {
        let url: URL;

        try {
            url = new URL(request.url);
        } catch {
            return new Response("Bad request", { status: 400 });
        }

        const workspaceId = url.hostname;
        const contentHash = decodeURIComponent(url.pathname.replace(/^\//, ""));

        if (!workspaceId || !HASH_PATTERN.test(contentHash)) {
            return new Response("Bad request", { status: 400 });
        }

        const asset = await resolve(workspaceId, contentHash);
        if (!asset) {
            return new Response("Not found", { status: 404 });
        }

        return new Response(asset.bytes, {
            headers: {
                "content-type": asset.mimeType,
                "cache-control": "private, max-age=31536000, immutable",
            },
        });
    });
}

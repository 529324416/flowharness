import { useState, type ReactElement, type ReactNode } from "react";
import type { ApiKeyRecord } from "@flowharness/contracts";
import { Badge, Button, Input } from "../ui";
import {
    PROTOCOL_LABELS,
    formatTime,
    keyErrorText,
    keyStatusMeta,
    maskFingerprint,
} from "./model";
import styles from "./ProviderLibraryDialog.module.css";

/** 密钥列表右侧的属性栏：元数据 + 重新验证 / 替换 / 删除。 */
export function KeyDetailPanel({
    record,
    busy,
    onRevalidate,
    onReplace,
    onDelete,
}: {
    record: ApiKeyRecord;
    busy: string | null;
    onRevalidate: () => void;
    onReplace: (apiKey: string) => Promise<boolean>;
    onDelete: () => void;
}): ReactElement {
    const meta = keyStatusMeta(record.status);
    const detail = keyErrorText(record.lastError);
    const [replacing, setReplacing] = useState(false);
    const [value, setValue] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);

    const submitReplace = async (): Promise<void> => {
        const next = value.trim();
        if (next.length === 0) {
            setLocalError("请输入新的 API Key");
            return;
        }
        setLocalError(null);
        if (await onReplace(next)) {
            setReplacing(false);
            setValue("");
        }
    };

    return (
        <>
            <header className={styles.detailTop}>
                <div className={styles.detailHeading}>
                    <span className={styles.detailTitle}>{record.label}</span>
                    <span className={styles.detailSubtitle}>{record.id}</span>
                </div>
                <div className={styles.badges}>
                    <Badge variant="neutral">
                        {PROTOCOL_LABELS[record.protocol]}
                    </Badge>
                    <Badge variant={meta.tone}>{meta.label}</Badge>
                </div>
            </header>

            <div className={styles.metaGrid}>
                <MetaItem
                    label="指纹"
                    value={maskFingerprint(record.fingerprint)}
                    mono
                />
                <MetaItem
                    label="Base URL"
                    value={record.baseUrl ?? "协议默认端点"}
                    mono={record.baseUrl !== undefined}
                />
                <MetaItem
                    label="最近验证"
                    value={
                        record.lastCheckedAt === undefined
                            ? "未验证"
                            : formatTime(record.lastCheckedAt)
                    }
                />
                <MetaItem label="创建时间" value={formatTime(record.createdAt)} />
                <MetaItem label="更新时间" value={formatTime(record.updatedAt)} />
            </div>

            {detail === undefined ? null : (
                <p className={styles.errorText}>{detail}</p>
            )}

            <div className={styles.actions}>
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={onRevalidate}
                >
                    {busy === `revalidate:${record.id}` ? "验证中…" : "重新验证"}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => {
                        setReplacing((current) => !current);
                        setLocalError(null);
                    }}
                >
                    {replacing ? "取消替换" : "替换密钥"}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={onDelete}
                >
                    删除
                </Button>
            </div>

            {replacing ? (
                <div className={styles.replaceRow}>
                    <Input
                        label="新 API Key"
                        type="password"
                        autoComplete="off"
                        autoFocus
                        value={value}
                        error={localError ?? undefined}
                        onChange={(event) => {
                            setValue(event.target.value);
                            setLocalError(null);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void submitReplace();
                        }}
                    />
                    <Button
                        size="sm"
                        variant="primary"
                        disabled={busy !== null}
                        onClick={() => void submitReplace()}
                    >
                        {busy === `replace:${record.id}` ? "保存中…" : "保存"}
                    </Button>
                </div>
            ) : null}
        </>
    );
}

function MetaItem({
    label,
    value,
    mono = false,
}: {
    label: string;
    value: ReactNode;
    mono?: boolean;
}): ReactElement {
    return (
        <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{label}</span>
            <span className={mono ? styles.metaValueMono : styles.metaValue}>
                {value}
            </span>
        </div>
    );
}

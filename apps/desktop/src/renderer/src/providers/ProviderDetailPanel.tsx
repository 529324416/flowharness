import { useState, type ReactElement } from "react";
import type { ApiKeyRecord, ProviderProfileStatus } from "@flowharness/contracts";
import { Badge, Button } from "../ui";
import {
    providerDraftFromProfile,
    isProviderDraftDirty,
    type ProviderDraft,
} from "./drafts";
import { ADAPTER_LABELS, formatTime, profileHealth } from "./model";
import { ProviderFormFields } from "./ProviderFormFields";
import styles from "./ProviderLibraryDialog.module.css";

const MAX_MODEL_CHIPS = 24;

/** Provider 列表右侧的属性栏：可直接编辑 profile 并查看模型目录。 */
export function ProviderDetailPanel({
    status,
    keys,
    busy,
    onSave,
    onRefreshModels,
    onDelete,
}: {
    status: ProviderProfileStatus;
    keys: readonly ApiKeyRecord[];
    busy: string | null;
    onSave: (draft: ProviderDraft) => void;
    onRefreshModels: () => void;
    onDelete: () => void;
}): ReactElement {
    const { profile } = status;
    const health = profileHealth(status);
    const [draft, setDraft] = useState<ProviderDraft>(() =>
        providerDraftFromProfile(profile),
    );
    const dirty = isProviderDraftDirty(draft, profile);
    const canSave =
        dirty && draft.label.trim().length > 0 && busy === null;
    const models = profile.models;

    return (
        <>
            <header className={styles.detailTop}>
                <div className={styles.detailHeading}>
                    <span className={styles.detailTitle}>{profile.label}</span>
                    <span className={styles.detailSubtitle}>
                        {ADAPTER_LABELS[profile.adapter]} · {profile.id}
                    </span>
                </div>
                <Badge variant={health.tone}>{health.label}</Badge>
            </header>

            {health.detail === undefined ? null : (
                <p className={styles.errorText}>{health.detail}</p>
            )}

            <ProviderFormFields draft={draft} onChange={setDraft} keys={keys} />

            <div className={styles.actions}>
                <Button
                    size="sm"
                    variant="primary"
                    disabled={!canSave}
                    onClick={() => onSave(draft)}
                >
                    {busy === `save-profile:${profile.id}` ? "保存中…" : "保存"}
                </Button>
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={onRefreshModels}
                >
                    {busy === `refresh:${profile.id}` ? "刷新中…" : "刷新模型"}
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

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>模型目录</span>
                    <Badge variant="neutral">{models.length}</Badge>
                    <span className={styles.sectionHint}>
                        {profile.modelsFetchedAt === undefined
                            ? "尚未刷新"
                            : `刷新于 ${formatTime(profile.modelsFetchedAt)}`}
                    </span>
                </div>
                {models.length === 0 ? (
                    <p className={styles.empty}>
                        还没有模型目录；刷新后会在这里列出。
                    </p>
                ) : (
                    <div className={styles.models}>
                        {models.slice(0, MAX_MODEL_CHIPS).map((model) => (
                            <span key={model.id} className={styles.modelChip}>
                                {model.id}
                            </span>
                        ))}
                        {models.length > MAX_MODEL_CHIPS ? (
                            <span className={styles.modelChip}>
                                +{models.length - MAX_MODEL_CHIPS}
                            </span>
                        ) : null}
                    </div>
                )}
            </section>
        </>
    );
}

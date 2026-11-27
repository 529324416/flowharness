import type { ReactElement } from "react";
import {
    Asterisk,
    Boxes,
    Braces,
    Cpu,
    Paperclip,
    Plug,
    Type,
    Wrench,
} from "lucide-react";

const PORT_ICONS = {
    text: Type,
    json: Braces,
    model: Cpu,
    provider: Plug,
    toolset: Wrench,
    attachments: Paperclip,
    attachment: Paperclip,
    any: Asterisk,
} as const;

/**
 * 未连接端口的类型图标：用图标而不是文字表达连线数据类型。
 */
export function PortTypeIcon({
    type,
    size = 10,
}: {
    type: string;
    size?: number;
}): ReactElement {
    const Icon = PORT_ICONS[type as keyof typeof PORT_ICONS] ?? Boxes;
    return <Icon size={size} aria-hidden="true" />;
}

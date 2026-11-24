export type Point = { x: number; y: number };

export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type Viewport = {
    x: number;
    y: number;
    zoom: number;
};

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
    return {
        x: (point.x - viewport.x) / viewport.zoom,
        y: (point.y - viewport.y) / viewport.zoom,
    };
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
    return {
        x: point.x * viewport.zoom + viewport.x,
        y: point.y * viewport.zoom + viewport.y,
    };
}

export function containsPoint(rect: Rect, point: Point): boolean {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
}

/** 两个世界坐标矩形是否相交；用于框选与视口裁剪。 */
export function intersects(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

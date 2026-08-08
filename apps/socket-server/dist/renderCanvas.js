import { createCanvas } from "@napi-rs/canvas";
// Keep in sync with the client canvas dimensions
export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 800;
/**
 * Renders a full stroke history to a PNG buffer. Used for on-demand
 * gallery thumbnails — called lazily and cached by the caller, not
 * persisted to disk/storage.
 */
export function renderStrokesToPng(strokes) {
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
        if (stroke.points.length < 2)
            continue;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    }
    return canvas.toBuffer("image/png");
}

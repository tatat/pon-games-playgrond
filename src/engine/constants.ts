/** Logical resolution scenes draw inside. The canvas itself fills the viewport;
 * see architecture/responsive.md. */
export const DESIGN_W = 1280
export const DESIGN_H = 720

/** Upper bound for the frame delta handed to `Scene.onUpdate`. Beyond this
 * the simulation effectively slows down (the game runs in real-time
 * proportional to `dt / actual frame time`) — preferable to letting a
 * single huge frame translate into tunneling / runaway physics. The value
 * (≈ 30 fps) is a balance between "spike absorption" and "noticeable
 * slowdown" at very low frame rates. */
export const MAX_DT_SEC = 1 / 30

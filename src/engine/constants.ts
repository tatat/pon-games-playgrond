/** Logical resolution scenes draw inside. The canvas itself fills the viewport;
 * see architecture/responsive.md. */
export const DESIGN_W = 1280
export const DESIGN_H = 720

/** Physics tick rate: 60Hz fixed. Independent of render fps. */
export const FIXED_DT = 1 / 60

/** Per-frame cap on physics steps to prevent the spiral of death after long pauses. */
export const MAX_STEPS_PER_FRAME = 5

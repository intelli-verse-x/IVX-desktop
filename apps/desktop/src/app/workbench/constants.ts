/**
 * Dimensions mirrored from VS Code's ActivitybarPart / SidebarPart
 * (microsoft/vscode …/parts/activitybar/activitybarPart.ts, sidebarPart.ts).
 *
 * We do not vendor VS Code — only the workbench layout contract:
 *   [ Activity Bar 48px ][ Side Bar ≥170 / ~300 ][ Editor ]
 */
export const ACTIVITY_BAR_WIDTH_PX = 48
export const ACTIVITY_ACTION_HEIGHT_PX = 48
export const ACTIVITY_ICON_SIZE_PX = 24
export const SIDE_BAR_DEFAULT_WIDTH_PX = 300
export const SIDE_BAR_MIN_WIDTH_PX = 170

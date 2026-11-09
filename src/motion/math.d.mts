export function bezier(c: number[]): (x: number) => number;
export function progress(frame: number, start: number, end: number): number;
export function eased(pack: any, name: string, frame: number, start: number, end: number): number;
export function lerp(a: number, b: number, t: number): number;
export function envelope(pack: any, ev: any, frame: number, exitFrames: number): number;
export function countValue(target: number, t: number, decimals?: number): number;
export function formatNumber(v: number, decimals?: number): string;
export function decimalsOf(v: number): number;
export function scaleRef(pack: any, px: number, frameWidth?: number): number;

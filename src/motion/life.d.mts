export function buildCameraKeys(plan: any, life: any): any[];
export function cameraAt(frame: number, keys: any[], life: any, fps?: number, seed?: string): { x: number; y: number; zoom: number; roll: number };
export function cameraTransform(c: { x: number; y: number; zoom: number; roll: number }): string;
export function backgroundAt(frame: number, cam: any, life: any, fps?: number, seed?: string): { x: number; y: number; scale: number };
export function backgroundTransform(b: { x: number; y: number; scale: number }): string;
export function motionReport(plan: any, life: any): { problems: string[]; stats: any };

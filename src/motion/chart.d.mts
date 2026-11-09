export function niceTicks(min: number, max: number, count?: number): { ticks: number[]; lo: number; hi: number; step: number };
export function lineDomain(values: number[]): { ticks: number[]; lo: number; hi: number; step: number };
export function plotPoints(values: number[], domain: { lo: number; hi: number }, box: { x: number; y: number; w: number; h: number }): [number, number][];
export function compact(v: number): string;
export function barDomain(values: number[]): { ticks: number[]; lo: number; hi: number; step: number };
export function barSlots(n: number, box: { x: number; y: number; w: number; h: number }, share?: number): { x: number; w: number; cx: number }[];
export function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string;

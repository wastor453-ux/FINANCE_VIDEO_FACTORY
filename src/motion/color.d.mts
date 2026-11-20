export function luminance(hex: string): number;
export function contrast(a: string, b: string): number;
export function textOn(bgs: string | string[], c: { ink: string; surface: string }): string;
export function strongestSeries(c: { surface: string; series: { fill: string; stroke: string; text: string }[] }): { fill: string; stroke: string; text: string };

// Lightweight numpy equivalents for client-side computation

export function nanMean(arr: number[]): number {
  const valid = arr.filter(v => !isNaN(v) && isFinite(v));
  if (valid.length === 0) return NaN;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function nanMedian(arr: number[]): number {
  const valid = arr.filter(v => !isNaN(v) && isFinite(v)).sort((a, b) => a - b);
  if (valid.length === 0) return NaN;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

export function nanStd(arr: number[]): number {
  const valid = arr.filter(v => !isNaN(v) && isFinite(v));
  if (valid.length < 2) return 0;
  const mu = nanMean(valid);
  const variance = valid.reduce((sum, v) => sum + (v - mu) ** 2, 0) / valid.length;
  return Math.sqrt(variance);
}

export function nanPercentile(arr: number[], pct: number): number {
  const valid = arr.filter(v => !isNaN(v) && isFinite(v)).sort((a, b) => a - b);
  if (valid.length === 0) return NaN;
  const idx = (pct / 100) * (valid.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return valid[lo];
  return valid[lo] + (valid[hi] - valid[lo]) * (idx - lo);
}

export function nanMax(arr: number[]): number {
  const valid = arr.filter(v => !isNaN(v) && isFinite(v));
  return valid.length ? Math.max(...valid) : NaN;
}

export function nanMin(arr: number[]): number {
  const valid = arr.filter(v => !isNaN(v) && isFinite(v));
  return valid.length ? Math.min(...valid) : NaN;
}

export function norm(arr: number[]): number {
  return Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0));
}

export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function cosine(a: number[], b: number[]): number {
  // Mask NaN values
  const validA: number[] = [];
  const validB: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (!isNaN(a[i]) && !isNaN(b[i])) {
      validA.push(a[i]);
      validB.push(b[i]);
    }
  }
  if (validA.length < 2) return 0;
  const d = norm(validA) * norm(validB);
  return d > 0 ? dotProduct(validA, validB) / d : 0;
}

export function corrcoef(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return NaN;
  const ma = nanMean(a);
  const mb = nanMean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const va = a[i] - ma;
    const vb = b[i] - mb;
    num += va * vb;
    da += va * va;
    db += vb * vb;
  }
  const denom = Math.sqrt(da) * Math.sqrt(db);
  return denom > 0 ? num / denom : NaN;
}

export function linspace(start: number, stop: number, n: number): number[] {
  if (n < 2) return [start];
  const step = (stop - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + step * i);
}

export function range(start: number, end: number, step = 1): number[] {
  const result: number[] = [];
  for (let i = start; i < end; i += step) result.push(i);
  return result;
}

export class VisualCompare {
  static compare(base64A: string, base64B: string): number {
    if (base64A === base64B) return 1.0;
    const lenA = base64A.length;
    const lenB = base64B.length;
    if (lenA === 0 || lenB === 0) return 0.0;
    const diff = Math.abs(lenA - lenB) / Math.max(lenA, lenB);
    return Math.max(0, 1 - diff * 10);
  }

  static hasChanged(base64A: string, base64B: string, threshold = 0.05): boolean {
    if (base64A === base64B) return false;
    const sim = VisualCompare.compare(base64A, base64B);
    return sim < 1 - threshold;
  }
}

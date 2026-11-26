import { describe, it, expect } from 'vitest';

function resolveControlLabelFromHtml(closestLabelText: string, childTextsToRemove: string[], isTextLike: boolean, ownVal: string): string {
  let txt = closestLabelText;
  for (const childTxt of childTextsToRemove) {
    if (childTxt) txt = txt.replace(childTxt, '');
  }
  txt = txt.replace(/\s+/g, ' ').trim();
  if (isTextLike && ownVal) {
    txt = txt.replace(ownVal, '').replace(/\s+/g, ' ').trim();
  }
  return txt;
}

describe('Label resolution (R3)', () => {
  it('preserves "on" in "conditions" for wrapping checkbox labels with default value "on"', () => {
    const resolved = resolveControlLabelFromHtml(' Accept terms & conditions', [], false, 'on');
    expect(resolved).toBe('Accept terms & conditions');
  });

  it('strips own value only for text-like inputs', () => {
    const resolved = resolveControlLabelFromHtml('Customer name John', [], true, 'John');
    expect(resolved).toBe('Customer name');
  });
});

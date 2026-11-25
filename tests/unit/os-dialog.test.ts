import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSaveAsTargetPath, isAllowedBrowserProcess } from '../../apps/local-bridge/src/os-dialog.js';

describe('os-dialog (scoped browser Save As helper)', () => {
  it('only allows Chrome, Brave, and Edge processes', () => {
    expect(isAllowedBrowserProcess('brave')).toBe(true);
    expect(isAllowedBrowserProcess('chrome.exe')).toBe(true);
    expect(isAllowedBrowserProcess('msedge')).toBe(true);
    expect(isAllowedBrowserProcess('explorer')).toBe(false);
    expect(isAllowedBrowserProcess('notepad.exe')).toBe(false);
  });

  it('sanitizes filenames and builds safe Save As target paths', () => {
    expect(buildSaveAsTargetPath(undefined, 'video:playback?.mp4')).toBe('video_playback_.mp4');
    const full = buildSaveAsTargetPath('D:/Downloads/drishti', 'linuxmint.iso');
    expect(full).toBe(path.join(path.resolve('D:/Downloads/drishti'), 'linuxmint.iso'));
    expect(buildSaveAsTargetPath(undefined, undefined)).toBeUndefined();
  });
});

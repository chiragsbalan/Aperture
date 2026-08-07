import { describe, expect, it } from 'vitest';

import { classifyAvatarInput } from './avatar-upload';

function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('classifyAvatarInput', () => {
  it('accepts jpeg/png/webp by MIME', () => {
    expect(classifyAvatarInput(fakeFile('a.jpg', 'image/jpeg'))).toBe('jpeg');
    expect(classifyAvatarInput(fakeFile('a.png', 'image/png'))).toBe('png');
    expect(classifyAvatarInput(fakeFile('a.webp', 'image/webp'))).toBe('webp');
  });

  it('treats HEIC as convert-to-jpeg', () => {
    expect(classifyAvatarInput(fakeFile('IMG.HEIC', 'image/heic'))).toBe(
      'convert',
    );
    expect(classifyAvatarInput(fakeFile('IMG.heif', 'image/heif'))).toBe(
      'convert',
    );
  });

  it('infers from extension when MIME is empty (common on iOS)', () => {
    expect(classifyAvatarInput(fakeFile('photo.JPG', ''))).toBe('jpeg');
    expect(classifyAvatarInput(fakeFile('photo.heic', ''))).toBe('convert');
  });

  it('tries decode when MIME and extension are missing', () => {
    expect(classifyAvatarInput(fakeFile('image', ''))).toBe('convert');
  });

  it('rejects unrelated types', () => {
    expect(classifyAvatarInput(fakeFile('x.gif', 'image/gif'))).toBe('reject');
    expect(classifyAvatarInput(fakeFile('x.pdf', 'application/pdf'))).toBe(
      'reject',
    );
  });
});

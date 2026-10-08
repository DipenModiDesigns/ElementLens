import { describe, expect, it } from 'vitest';
import { toAbsoluteSrcset, toAbsoluteUrl } from '@/core/extract/url';

const BASE = 'https://example.com/blog/post.html';

describe('toAbsoluteUrl', () => {
  it('resolves relative paths', () => {
    expect(toAbsoluteUrl('img/a.png', BASE)).toBe('https://example.com/blog/img/a.png');
    expect(toAbsoluteUrl('/a.png', BASE)).toBe('https://example.com/a.png');
    expect(toAbsoluteUrl('//cdn.example.com/a.png', BASE)).toBe('https://cdn.example.com/a.png');
  });

  it('keeps absolute, data, blob and hash values', () => {
    expect(toAbsoluteUrl('https://other.com/x', BASE)).toBe('https://other.com/x');
    expect(toAbsoluteUrl('data:image/png;base64,AAA', BASE)).toBe('data:image/png;base64,AAA');
    expect(toAbsoluteUrl('blob:https://example.com/1', BASE)).toBe('blob:https://example.com/1');
    expect(toAbsoluteUrl('#top', BASE)).toBe('#top');
  });
});

describe('toAbsoluteSrcset', () => {
  it('resolves each candidate and keeps descriptors', () => {
    expect(toAbsoluteSrcset('a.jpg 1x, /b.jpg 2x', BASE)).toBe(
      'https://example.com/blog/a.jpg 1x, https://example.com/b.jpg 2x',
    );
  });
});

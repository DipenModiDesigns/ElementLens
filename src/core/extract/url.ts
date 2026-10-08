/** Resolve a possibly relative URL against a base. Leaves data:, blob:, # and invalid values untouched. */
export function toAbsoluteUrl(value: string, base: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^(data:|blob:|javascript:|#)/i.test(trimmed)) return value;
  try {
    return new URL(trimmed, base).href;
  } catch {
    return value;
  }
}

/** Resolve every URL in a srcset ("a.jpg 1x, b.jpg 2x") while keeping the descriptors. */
export function toAbsoluteSrcset(srcset: string, base: string): string {
  return srcset
    .split(',')
    .map((candidate) => {
      const [url, ...descriptors] = candidate.trim().split(/\s+/);
      if (!url) return '';
      return [toAbsoluteUrl(url, base), ...descriptors].join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

import { describe, expect, it } from 'vitest';
import { fileSlug, fullSnippet, standaloneDocument } from '@/core/export/snippet';

describe('fullSnippet', () => {
  it('puts the style block after the markup', () => {
    expect(fullSnippet('<p>hi</p>', 'p {\n  color: red;\n}')).toBe(
      '<p>hi</p>\n\n<style>\np {\n  color: red;\n}\n</style>',
    );
  });

  it('returns only the markup when there is no CSS', () => {
    expect(fullSnippet('<p>hi</p>', '  ')).toBe('<p>hi</p>');
  });
});

describe('standaloneDocument', () => {
  it('builds a complete, indented page with an escaped title', () => {
    const doc = standaloneDocument('<p>hi</p>', 'p {\n  color: red;\n}', 'a<b>');
    expect(doc.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(doc).toContain('<title>a&lt;b&gt;</title>');
    expect(doc).toContain('    <style>\n    p {\n      color: red;\n    }\n    </style>');
    expect(doc).toContain('  <body>\n    <p>hi</p>\n  </body>');
  });
});

describe('fileSlug', () => {
  it('makes safe file names from element labels', () => {
    expect(fileSlug('div.card.md:flex')).toBe('div-card-md-flex');
    expect(fileSlug('#main…')).toBe('main');
    expect(fileSlug('***')).toBe('element');
  });
});

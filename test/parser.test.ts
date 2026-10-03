import { describe, expect, it } from 'vitest';
import { FormError, isGoogleFormUrl, parseFormHtml, parseLoadData, publicIdFromUrl, toViewUrl } from '../src/core/parser';
import { FORM_ID, KITCHEN_SINK, kitchenSinkHtml } from './fixtures';

const form = parseLoadData(KITCHEN_SINK, { fbzx: '42' });
const q = (itemId: string) => form.questions.find((x) => x.itemId === itemId)!;

describe('parseLoadData', () => {
  it('reads form-level metadata', () => {
    expect(form.id).toBe(FORM_ID);
    expect(form.title).toBe('Kitchen sink');
    expect(form.description).toMatch(/every question type/);
    expect(form.actionUrl).toBe(`https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`);
    expect(form.emailMode).toBe('input');
    expect(form.fbzx).toBe('42');
  });

  it('skips non-question items and maps every type', () => {
    expect(form.questions.map((x) => x.kind)).toEqual([
      'short', 'short', 'short', 'short', 'paragraph', 'choice', 'dropdown', 'checkbox', 'scale', 'choice',
      'grid', 'checkGrid', 'date', 'date', 'time', 'time', 'choice', 'file', 'rating', 'paragraph',
    ]);
  });

  it('builds sections with branching', () => {
    expect(form.sections.map((s) => s.title)).toEqual(['Kitchen sink', 'Extra section', 'Final section']);
    expect(form.sections[1]!.next).toEqual({ kind: 'next' });
    expect(q('116').options[0]!.nav).toEqual({ kind: 'section', index: 1 });
    expect(q('116').options[1]!.nav).toEqual({ kind: 'submit' });
    expect(q('118').section).toBe(1);
    expect(q('120').section).toBe(2);
  });

  it('parses validation rules', () => {
    expect(q('101').validation).toMatchObject({ kind: 'text', op: 'email' });
    expect(q('102').validation).toMatchObject({ kind: 'number', op: 'between', a: 18, b: 65 });
    expect(q('103').validation).toMatchObject({ kind: 'regex', op: 'matches', pattern: '[A-Z]{2}\\d{4}' });
    expect(q('104').validation).toMatchObject({ kind: 'length', op: 'max', value: 40 });
    expect(q('107').validation).toMatchObject({ kind: 'count', op: 'atLeast', value: 2 });
  });

  it('reads options, other, scale labels and grids', () => {
    expect(q('105').hasOther).toBe(true);
    expect(q('105').options.map((o) => o.label)).toEqual(['Red', 'Green', 'Blue', '']);
    expect(q('108').scaleLabels).toEqual(['Not at all', 'Very']);
    expect(q('110').rows.map((r) => [r.entryId, r.label])).toEqual([['1101', 'Food'], ['1102', 'Service']]);
    expect(q('110').required).toBe(true);
    expect(q('111').required).toBe(false);
  });

  it('reads date and time flags', () => {
    expect(q('112')).toMatchObject({ includeYear: true, includeTime: false });
    expect(q('113')).toMatchObject({ includeYear: false, includeTime: true });
    expect(q('114').duration).toBe(false);
    expect(q('115').duration).toBe(true);
  });
});

describe('parseFormHtml', () => {
  it('extracts the payload and fbzx from HTML', () => {
    const f = parseFormHtml(kitchenSinkHtml(), `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`);
    expect(f.questions).toHaveLength(20);
    expect(f.fbzx).toBe('-1234567890123456789');
  });

  it('detects sign-in walls and closed forms', () => {
    expect(() => parseFormHtml('<html></html>', 'https://accounts.google.com/ServiceLogin?continue=x')).toThrowError(FormError);
    try {
      parseFormHtml('<html>closed</html>', `https://docs.google.com/forms/d/e/${FORM_ID}/closedform`);
    } catch (e) {
      expect((e as FormError).code).toBe('closed');
    }
    expect(() => parseFormHtml('<html>hello</html>', 'https://docs.google.com/forms/d/e/x/viewform')).toThrowError(/form data/);
  });
});

describe('urls', () => {
  it('recognizes and normalizes form links', () => {
    expect(isGoogleFormUrl(`https://docs.google.com/forms/d/e/${FORM_ID}/viewform?usp=sf_link`)).toBe(true);
    expect(isGoogleFormUrl('https://forms.gle/abc123')).toBe(true);
    expect(isGoogleFormUrl('https://example.com/forms/d/e/x')).toBe(false);
    expect(publicIdFromUrl(`https://docs.google.com/forms/u/1/d/e/${FORM_ID}/formResponse`)).toBe(FORM_ID);
    expect(toViewUrl(`https://docs.google.com/forms/d/e/${FORM_ID}/viewform?usp=pp_url&entry.1=x`)).toBe(
      `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`,
    );
    expect(toViewUrl('https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit')).toBe(
      'https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/viewform',
    );
    expect(() => toViewUrl('https://example.com')).toThrowError(FormError);
  });
});

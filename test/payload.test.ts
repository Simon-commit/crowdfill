import { describe, expect, it } from 'vitest';
import { OTHER_VALUE } from '../src/core/generator';
import { classifyResponse } from '../src/core/outcome';
import { parseLoadData } from '../src/core/parser';
import { autoMapColumns, buildPayload, buildPrefillUrl, columnsFor, parseCsv, toCsv } from '../src/core/payload';
import type { GeneratedResponse } from '../src/core/types';
import { KITCHEN_SINK } from './fixtures';

const form = parseLoadData(KITCHEN_SINK, { fbzx: '-99' });

const response: GeneratedResponse = {
  index: 0,
  path: [0],
  email: 'ada@example.com',
  respondent: {
    firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', username: 'ada', phone: '', age: 36,
    city: 'London', country: 'United Kingdom', company: 'Acme', jobTitle: 'Engineer', sentiment: 0.8,
  },
  answers: {
    '100': { t: 'text', v: 'Ada Lovelace' },
    '105': { t: 'choice', v: OTHER_VALUE, other: 'Purple' },
    '107': { t: 'multi', v: ['Cheese', 'Olives'] },
    '110': { t: 'grid', rows: { '1101': ['Good'], '1102': ['Excellent'] } },
    '111': { t: 'grid', rows: { '1111': ['Mon', 'Wed'] } },
    '112': { t: 'date', y: 2024, m: 3, d: 9 },
    '113': { t: 'date', m: 12, d: 1, hh: 14, mm: 5 },
    '114': { t: 'time', hh: 7, mm: 30 },
    '115': { t: 'time', hh: 1, mm: 2, ss: 3 },
    '120': { t: 'text', v: 'not visited' },
  },
};

describe('buildPayload', () => {
  const p = buildPayload(form, response);

  it("matches the fields Google's own form posts", () => {
    expect(p.get('entry.1001')).toBe('Ada Lovelace');
    expect(p.getAll('entry.1051')).toEqual([OTHER_VALUE]);
    expect(p.get('entry.1051.other_option_response')).toBe('Purple');
    expect(p.getAll('entry.1071')).toEqual(['Cheese', 'Olives']);
    expect(p.get('entry.1101')).toBe('Good');
    expect(p.get('entry.1102')).toBe('Excellent');
    expect(p.getAll('entry.1111')).toEqual(['Mon', 'Wed']);
    expect([p.get('entry.1121_year'), p.get('entry.1121_month'), p.get('entry.1121_day')]).toEqual(['2024', '3', '9']);
    expect(p.has('entry.1131_year')).toBe(false);
    expect([p.get('entry.1131_hour'), p.get('entry.1131_minute')]).toEqual(['14', '05']);
    expect([p.get('entry.1141_hour'), p.get('entry.1141_minute')]).toEqual(['07', '30']);
    expect(p.get('entry.1151_second')).toBe('03');
    expect(p.get('emailAddress')).toBe('ada@example.com');
    expect(p.has('entry.1051_sentinel')).toBe(true);
    expect(p.has('entry.1061_sentinel')).toBe(false); // dropdowns have no sentinel
    expect(p.get('fvv')).toBe('1');
    expect(p.get('fbzx')).toBe('-99');
    expect(p.get('partialResponse')).toBe('[null,null,"-99"]');
    expect(p.get('pageHistory')).toBe('0');
  });

  it('omits answers from sections the respondent never visited', () => {
    expect(p.has('entry.1201')).toBe(false);
    const p2 = buildPayload(form, { ...response, path: [0, 1, 2] });
    expect(p2.get('entry.1201')).toBe('not visited');
    expect(p2.get('pageHistory')).toBe('0,1,2');
  });
});

describe('prefill and csv', () => {
  it('builds a pre-filled link', () => {
    const url = new URL(buildPrefillUrl(form, response));
    expect(url.searchParams.get('usp')).toBe('pp_url');
    expect(url.searchParams.get('entry.1121')).toBe('2024-03-09');
    expect(url.searchParams.get('entry.1141')).toBe('07:30');
  });

  it('round-trips CSV and auto-maps Google-style headers', () => {
    const csv = toCsv(form, [response]);
    const rows = parseCsv(csv);
    expect(rows[0]).toContain('Rate the parts [Food]');
    expect(rows[1]).toContain('Cheese, Olives');
    const mapping = autoMapColumns(form, rows[0]!);
    expect(mapping['100']).toBe(rows[0]!.indexOf('Your name'));
    expect(mapping['1102']).toBe(rows[0]!.indexOf('Rate the parts [Service]'));
    expect(mapping.emailAddress).toBe(1);
    expect(columnsFor(form).some((c) => c.key === '118')).toBe(false); // file upload skipped
  });

  it('parses quoted CSV and semicolons', () => {
    expect(parseCsv('a,"b, c","d ""q"""\r\n1,2,3\n')).toEqual([['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
    expect(parseCsv('x;y\n1;2')).toEqual([['x', 'y'], ['1', '2']]);
  });
});

describe('classifyResponse', () => {
  const url = 'https://docs.google.com/forms/d/e/x/formResponse';
  it('recognizes success, rejection, login and throttling', () => {
    expect(classifyResponse(200, url, '<a href="https://docs.google.com/forms/d/e/x/viewform?usp=form_confirm">')).toEqual({ ok: true, confirmed: true });
    expect(classifyResponse(200, url, '<html>Thanks</html>')).toEqual({ ok: true, confirmed: false });
    expect(classifyResponse(200, url, '<form action="https://docs.google.com/forms/d/e/x/formResponse"><input name="pageHistory">')).toMatchObject({ ok: false, reason: 'rejected' });
    expect(classifyResponse(200, 'https://accounts.google.com/v3/signin/identifier', '')).toMatchObject({ ok: false, reason: 'login' });
    expect(classifyResponse(429, url, '')).toMatchObject({ ok: false, retryable: true });
    expect(classifyResponse(400, url, '')).toMatchObject({ ok: false, retryable: false });
  });
});

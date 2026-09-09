import { describe, it, expect } from 'vitest';
import { normalizeNameTokens, scoreNameMatch, bestNameMatch, parseYearlessBirthday } from '../name-match.js';

describe('name matching', () => {
  it('normalises noisy names', () => {
    expect(normalizeNameTokens('  MARTHA JOHN-WILLIAMS ')).toEqual(['martha', 'john', 'williams']);
    expect(normalizeNameTokens('Mr. Daniel  Oguamanam')).toEqual(['daniel', 'oguamanam']);
  });

  it('scores order-independent token overlap', () => {
    expect(scoreNameMatch('UCHENNA CHINENYE', 'Chinenye Uchenna').score).toBe(1);
    expect(scoreNameMatch('Jacob Onoja', 'Onoja Jacob').score).toBe(1);
    expect(scoreNameMatch('OGBEIDE MERCY ADESUWA', 'Mercy Ogbeide').score).toBe(1); // subset match
    expect(scoreNameMatch('Aanu Oyeniran', 'David Folawewo').score).toBe(0);
  });

  it('tolerates one typo / prefix in a token', () => {
    expect(scoreNameMatch('UKABUIKE LOVETH', 'Loveth Ubabuike').matched).toBe(2);
    expect(scoreNameMatch('Olanrewaju Victoria', 'Victoria Olanrenwaju').score).toBe(1);
  });

  it('bestNameMatch picks the right person and flags weak/ambiguous', () => {
    const dir = [
      { id: 'a', first: 'Chinenye', last: 'Uchenna' },
      { id: 'b', first: 'Nicole', last: 'Okafor' },
      { id: 'c', first: 'Mercy', last: 'Ogbeide' },
      { id: 'd', first: 'Martha', last: 'John-Williams' },
    ];
    const describe = (m: (typeof dir)[number]) => [`${m.first} ${m.last}`, `${m.last} ${m.first}`];

    expect(bestNameMatch('UCHENNA CHINENYE', dir, describe).match?.id).toBe('a');
    expect(bestNameMatch('MARTHA JOHN-WILLIAMS', dir, describe).match?.id).toBe('d');
    expect(bestNameMatch('OGBEIDE MERCY ADESUWA', dir, describe).match?.id).toBe('c');
    expect(bestNameMatch('SOMEONE ENTIRELY UNKNOWN', dir, describe).match).toBeNull();
    // Single distinctive token still needs a strong hit.
    expect(bestNameMatch('Okafor', dir, describe).match?.id).toBe('b');
  });

  it('detects ambiguity between two equally-good matches', () => {
    const dir = [
      { id: '1', name: 'Victoria Kenneth' },
      { id: '2', name: 'Victoria Olanrewaju' },
    ];
    const res = bestNameMatch('Victoria', dir, (m) => [m.name]);
    expect(res.ambiguous).toBe(true);
  });

  it('parses yearless birthdays', () => {
    expect(parseYearlessBirthday('14th March')).toBe('03-14');
    expect(parseYearlessBirthday('13 September')).toBe('09-13');
    expect(parseYearlessBirthday('3rd  February')).toBe('02-03');
    expect(parseYearlessBirthday('sometime')).toBeNull();
  });
});

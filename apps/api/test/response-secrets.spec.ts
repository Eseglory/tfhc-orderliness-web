import { removeResponseSecrets } from '../src/common/interceptors/response-secrets.interceptor';
describe('HTTP response credential removal', () => {
  test('strips nested credentials without changing input or ordinary fields', () => {
    const date = new Date();
    const source = { meeting: { id: 'meeting', qrSecret: 'secret' }, users: [{ email: 'test@example.test', passwordHash: 'hash', googleSubject: 'subject' }], date, empty: null };
    expect(removeResponseSecrets(source)).toEqual({ meeting: {id:'meeting'}, users:[{email:'test@example.test'}], date, empty:null });
    expect(source.meeting.qrSecret).toBe('secret');
  });
  test('preserves binary report data', () => {
    const report = Buffer.from('report');
    expect(removeResponseSecrets(report)).toBe(report);
  });
});

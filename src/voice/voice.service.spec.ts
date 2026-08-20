import * as crypto from 'crypto';
import { VoiceService } from './voice.service';

describe('VoiceService', () => {
  const FIXED_NOW_MS = 1_700_000_000_000;
  const SECRET = 'test-secret';

  beforeEach(() => {
    process.env.TURN_SECRET = SECRET;
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW_MS);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.TURN_SECRET;
  });

  it('mints a username in "<expiryUnixTimestamp>:<userId>" format, 24h (86400s) out from now', () => {
    const service = new VoiceService();

    const { username, ttl } = service.generateTurnCredentials('user_1');

    const expectedExpiry = Math.floor(FIXED_NOW_MS / 1000) + 86400;
    expect(username).toBe(`${expectedExpiry}:user_1`);
    expect(ttl).toBe(86400);
  });

  it('computes credential as the base64 HMAC-SHA1 of the username, keyed by TURN_SECRET', () => {
    const service = new VoiceService();

    const { username, credential } = service.generateTurnCredentials('user_1');

    const expected = crypto.createHmac('sha1', SECRET).update(username).digest('base64');
    expect(credential).toBe(expected);
  });

  it('mints a different username and credential for a different userId at the same instant', () => {
    const service = new VoiceService();

    const a = service.generateTurnCredentials('user_1');
    const b = service.generateTurnCredentials('user_2');

    expect(a.username).not.toBe(b.username);
    expect(a.credential).not.toBe(b.credential);
  });

  it('throws when TURN_SECRET is not configured', () => {
    delete process.env.TURN_SECRET;
    const service = new VoiceService();

    expect(() => service.generateTurnCredentials('user_1')).toThrow(
      'TURN_SECRET is not configured',
    );
  });
});

import { parseRedisUrl } from './redis.module';

describe('parseRedisUrl', () => {
  it('parses host, port, and password from a redis URL', () => {
    expect(parseRedisUrl('redis://:secret@localhost:6380')).toEqual({
      host: 'localhost',
      port: 6380,
      password: 'secret',
    });
  });

  it('defaults to port 6379 when not specified', () => {
    expect(parseRedisUrl('redis://localhost')).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
  });
});

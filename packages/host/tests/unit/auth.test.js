/**
 * Unit tests for Chronicle Host auth middleware.
 */
const {
  encrypt,
  decrypt,
  hashPassword,
  normalizeAdminToken,
  requireAdminToken,
} = require('../../src/middleware/auth');

describe('encrypt / decrypt', () => {
  it('roundtrips plain text', () => {
    const original = 'hello world';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('roundtrips empty string', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('roundtrips unicode text', () => {
    const original = '你好世界 🎉';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('decrypt returns empty string for invalid input', () => {
    expect(decrypt('bad-input')).toBe('');
    expect(decrypt('')).toBe('');
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const a = encrypt('same text');
    const b = encrypt('same text');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same text');
    expect(decrypt(b)).toBe('same text');
  });
});

describe('hashPassword', () => {
  it('returns a 128-character hex string', () => {
    const hash = hashPassword('test-password');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(128); // scrypt 64 bytes = 128 hex chars
  });

  it('is deterministic', () => {
    const a = hashPassword('password');
    const b = hashPassword('password');
    expect(a).toBe(b);
  });

  it('produces different hashes for different passwords', () => {
    expect(hashPassword('pass1')).not.toBe(hashPassword('pass2'));
  });
});

describe('normalizeAdminToken', () => {
  it('returns empty token for falsy input', () => {
    expect(normalizeAdminToken(null)).toEqual({ token: '' });
    expect(normalizeAdminToken(undefined)).toEqual({ token: '' });
    expect(normalizeAdminToken('')).toEqual({ token: '' });
  });

  it('returns token from plain string', () => {
    const result = normalizeAdminToken('my-token');
    expect(result).toEqual({ token: 'my-token' });
  });

  it('trims whitespace from string tokens', () => {
    const result = normalizeAdminToken('  token-with-spaces  ');
    expect(result).toEqual({ token: 'token-with-spaces' });
  });

  it('parses JSON object strings', () => {
    const result = normalizeAdminToken('{"token":"json-token","expiry":9999999999999}');
    expect(result.token).toBe('json-token');
    expect(result.expiry).toBe(9999999999999);
  });

  it('handles object input with token and expiry', () => {
    const result = normalizeAdminToken({ token: 'obj-token', expiry: 12345 });
    expect(result).toEqual({ token: 'obj-token', expiry: 12345 });
  });

  it('returns empty token for non-stringifiable input', () => {
    expect(normalizeAdminToken('   ')).toEqual({ token: '' });
  });
});

describe('requireAdminToken', () => {
  function mockRes() {
    return {
      statusCode: 200,
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; },
    };
  }

  function mockReq(headers = {}, body = {}) {
    return { headers, body };
  }

  it('returns true for session-valid token', () => {
    const res = mockRes();
    const req = mockReq({ 'x-chronicle-auth': 'session-valid' });
    expect(requireAdminToken(req, res)).toBe(true);
  });

  it('returns true for active token', () => {
    const res = mockRes();
    const req = mockReq({ 'x-chronicle-auth': 'active' });
    expect(requireAdminToken(req, res)).toBe(true);
  });

  it('returns false and sends 401 for invalid token', () => {
    const res = mockRes();
    const req = mockReq({ 'x-chronicle-auth': 'invalid' });
    expect(requireAdminToken(req, res)).toBe(false);
    expect(res._status).toBe(401);
  });

  it('returns false and sends 401 for missing token', () => {
    const res = mockRes();
    const req = mockReq();
    expect(requireAdminToken(req, res)).toBe(false);
    expect(res._status).toBe(401);
  });

  it('checks body token as fallback', () => {
    const res = mockRes();
    const req = mockReq({}, { token: 'session-valid' });
    expect(requireAdminToken(req, res)).toBe(true);
  });

  it('rejects expired token', () => {
    const res = mockRes();
    const req = mockReq({ 'x-chronicle-auth': '{"token":"active","expiry":1}' });
    expect(requireAdminToken(req, res)).toBe(false);
  });
});

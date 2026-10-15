import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AppConfig } from '../../config/config.module.js';
import { maskPhone, Msg91SmsProvider } from './sms.module.js';

/** A local stand-in for MSG91's Flow API: records each request and answers with `reply`. */
describe('Msg91SmsProvider (against a local fake MSG91 server)', () => {
  let server: Server;
  let baseUrl: string;
  let requests: { url?: string; headers: IncomingMessage['headers']; body: unknown }[];
  let reply: { status: number; body: string };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        requests.push({ url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(reply.body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => {
    requests = [];
    reply = { status: 200, body: JSON.stringify({ type: 'success', message: '5e1e93cad6fc054d8e759a5b' }) };
  });

  const provider = (overrides: Partial<AppConfig> = {}) =>
    new Msg91SmsProvider({
      MSG91_AUTH_KEY: 'test-auth-key-123',
      MSG91_OTP_TEMPLATE_ID: 'tmpl-otp-1',
      MSG91_OTP_CODE_VAR: 'var1',
      MSG91_BASE_URL: baseUrl,
      ...overrides,
    } as AppConfig);

  it('sends the code into the DLT template, with the key in the authkey header', async () => {
    await provider().send('+919845012345', 'full text is not sent', '482913');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('/api/v5/flow');
    expect(requests[0]!.headers.authkey).toBe('test-auth-key-123');
    expect(requests[0]!.headers['content-type']).toBe('application/json');
    expect(requests[0]!.body).toEqual({
      template_id: 'tmpl-otp-1',
      short_url: '0',
      recipients: [{ mobiles: '919845012345', var1: '482913' }],
    });
  });

  it('uses the template variable name from configuration', async () => {
    await provider({ MSG91_OTP_CODE_VAR: 'otp' }).send('+919845012345', '', '111222');
    expect((requests[0]!.body as { recipients: object[] }).recipients[0]).toEqual({ mobiles: '919845012345', otp: '111222' });
  });

  it('fails on an error answer or a non-2xx status, without the code or key in the message', async () => {
    reply = { status: 200, body: JSON.stringify({ type: 'error', message: 'Template not approved' }) };
    const failure = provider().send('+919845012345', '', '482913');
    await expect(failure).rejects.toThrow(/Template not approved/);
    await expect(failure).rejects.not.toThrow(/482913|test-auth-key/);

    reply = { status: 401, body: 'not json' };
    await expect(provider().send('+919845012345', '', '482913')).rejects.toThrow(/HTTP 401/);
  });

  it('refuses to start without its key or template', () => {
    expect(() => provider({ MSG91_AUTH_KEY: undefined })).toThrow(/required for MSG91/);
    expect(() => provider({ MSG91_OTP_TEMPLATE_ID: undefined })).toThrow(/required for MSG91/);
  });

  it('masks phone numbers in logs and errors', () => {
    expect(maskPhone('+919845012345')).toBe('+91******2345');
  });
});

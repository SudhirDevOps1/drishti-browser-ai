import { describe, it, expect } from 'vitest';
import { encodeNativeMessage, createNativeMessageDecoder } from '../../apps/local-bridge/src/native-host.js';
import { BridgeServer } from '../../apps/local-bridge/src/bridge-server.js';
import { BridgeClient } from '../../apps/mcp-server/src/bridge-client.js';
import { CdpSessionManager } from '../../apps/chrome-extension/src/background/cdp-session.js';

describe('Native Messaging, Named Pipe & Persistent CDP Session', () => {
  it('encodes and decodes 4-byte length-prefixed Native Messaging JSON across split chunks', () => {
    const m1 = { type: 'ping', id: '1', text: 'नमस्ते Drishti' };
    const m2 = { type: 'command', id: '2', action: 'CLICK', payload: { x: 10, y: 20 } };
    const combined = Buffer.concat([encodeNativeMessage(m1), encodeNativeMessage(m2)]);

    const received: unknown[] = [];
    const errors: Error[] = [];
    const decode = createNativeMessageDecoder(
      (msg) => received.push(msg),
      (err) => errors.push(err)
    );

    // Split arbitrarily mid-header and mid-payload
    decode(combined.subarray(0, 2));
    decode(combined.subarray(2, 11));
    decode(combined.subarray(11));

    expect(errors).toEqual([]);
    expect(received).toEqual([m1, m2]);
  });

  it('roundtrips MCP commands over Named Pipe without auth token when Native extension is attached', async () => {
    const pipePath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\drishti-unit-${Date.now()}-${Math.floor(Math.random() * 10000)}`
        : `/tmp/drishti-unit-${Date.now()}-${Math.floor(Math.random() * 10000)}.sock`;

    const server = new BridgeServer({ port: 0, authToken: 'unused', pipePath });
    await server.start();

    const sentToExt: any[] = [];
    const mockNative = {
      isOpen: () => true,
      send: (payload: any) => {
        sentToExt.push(payload);
        if (payload?.id && payload?.action === 'BROWSER_STATUS') {
          setTimeout(() => {
            void server.handleNativeMessage({
              type: 'response',
              id: payload.id,
              result: { bridgeConnected: true, transport: 'native' },
            });
          }, 5);
        }
        return true;
      },
      close: () => {},
    };
    server.attachNativeExtension(mockNative);

    process.env.BRIDGE_PIPE_PATH = pipePath;
    const client = new BridgeClient('ws://127.0.0.1:7483', '');
    try {
      await client.connect();
      expect(client.isConnected()).toBe(true);
      const res = (await client.sendCommand('BROWSER_STATUS', {})) as Record<string, unknown>;
      expect(res.bridgeConnected).toBe(true);
      expect(res.transport).toBe('native');
      expect(sentToExt.length).toBe(1);
    } finally {
      delete process.env.BRIDGE_PIPE_PATH;
      await client.disconnect();
      await server.stop();
    }
  });

  it('reuses a single chrome.debugger attach per tab and auto-detaches after idle timeout', async () => {
    let attachCalls = 0;
    let detachCalls = 0;
    const commands: string[] = [];

    const mgr = new CdpSessionManager({
      idleMs: 60,
      adapter: {
        attach: async () => {
          attachCalls++;
        },
        detach: async () => {
          detachCalls++;
        },
        sendCommand: async (_tabId, method) => {
          commands.push(method);
          return { ok: true };
        },
      },
    });

    await mgr.sendCommand(42, 'Input.dispatchMouseEvent', { type: 'mouseMoved' });
    await mgr.sendCommand(42, 'Runtime.evaluate', { expression: '1+1' });
    await mgr.sendCommand(42, 'Page.printToPDF', {});

    expect(attachCalls).toBe(1);
    expect(detachCalls).toBe(0);
    expect(commands).toEqual(['Input.dispatchMouseEvent', 'Runtime.evaluate', 'Page.printToPDF']);
    expect(mgr.isAttached(42)).toBe(true);

    // Wait for idle auto-detach
    await new Promise((r) => setTimeout(r, 120));
    expect(detachCalls).toBe(1);
    expect(mgr.isAttached(42)).toBe(false);
  });
});

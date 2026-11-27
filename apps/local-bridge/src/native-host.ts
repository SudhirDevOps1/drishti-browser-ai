/**
 * Chrome Native Messaging framing (4-byte little-endian uint32 length + UTF-8 JSON)
 * over stdin/stdout, plus a clean transport wrapper for BridgeServer.
 */

export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024; // Chrome Native Messaging 1 MB host->extension limit

export function encodeNativeMessage(payload: unknown): Buffer {
  const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(jsonBuf.length, 0);
  return Buffer.concat([header, jsonBuf]);
}

export function createNativeMessageDecoder(
  onMessage: (msg: Record<string, unknown>) => void,
  onError?: (err: Error) => void
): (chunk: Buffer) => void {
  let buffer: Buffer = Buffer.alloc(0);

  return (chunk: Buffer) => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const msgLen = buffer.readUInt32LE(0);
      if (msgLen === 0 || msgLen > 10 * 1024 * 1024) {
        buffer = Buffer.alloc(0);
        onError?.(new Error(`Invalid native message length: ${msgLen}`));
        return;
      }
      if (buffer.length < 4 + msgLen) {
        return; // Wait for remaining bytes
      }
      const raw = buffer.subarray(4, 4 + msgLen).toString('utf8');
      buffer = buffer.subarray(4 + msgLen);
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        onMessage(parsed);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };
}

export interface NativeHostTransport {
  send(payload: unknown): boolean;
  isOpen(): boolean;
  close(): void;
}

export function attachNativeStdioTransport(options: {
  onMessage: (msg: Record<string, unknown>) => void;
  onClose: () => void;
  onError?: (err: Error) => void;
}): NativeHostTransport {
  let open = true;
  const decode = createNativeMessageDecoder(options.onMessage, options.onError);

  const onData = (chunk: Buffer) => {
    if (!open) return;
    decode(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  };

  const onEnd = () => {
    if (!open) return;
    open = false;
    options.onClose();
  };

  process.stdin.on('data', onData);
  process.stdin.once('end', onEnd);
  process.stdin.once('close', onEnd);
  process.stdin.resume();

  return {
    send(payload: unknown): boolean {
      if (!open) return false;
      try {
        const framed = encodeNativeMessage(payload);
        process.stdout.write(framed);
        return true;
      } catch (err) {
        options.onError?.(err instanceof Error ? err : new Error(String(err)));
        return false;
      }
    },
    isOpen(): boolean {
      return open;
    },
    close(): void {
      if (!open) return;
      open = false;
      process.stdin.off('data', onData);
    },
  };
}

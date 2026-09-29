import { once } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import { connect, createServer, type Socket } from 'node:net';

import { z } from 'zod';

import { newNonce, proof, validProof } from '../cluster/handshake';
import { LOOPBACK } from '../cluster/sharedState';
import { parseJson } from '../json';
import { readOptional, writeAtomic } from '../storage/sharedFile';

const HANDSHAKE_TIMEOUT_MS = 5000;
const MAX_LINE = 256;
const READY = 'ok';
const NEWLINE = 10;

const linkSchema = z.object({ port: z.number().int().positive() });

export interface OriginLink {
  close(): Promise<void>;
}

function readLine(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    const finish = (error: Error | null, line: string): void => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('close', onClose);
      socket.pause();
      if (error) reject(error);
      else resolve(line);
    };
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf(NEWLINE);
      if (end === -1) {
        if (buffered.length > MAX_LINE) finish(new Error('The link handshake is too long'), '');
        return;
      }
      if (end !== buffered.length - 1) {
        finish(new Error('The link sent data before the handshake finished'), '');
        return;
      }
      finish(null, buffered.subarray(0, end).toString('latin1'));
    };
    const onClose = (): void => finish(new Error('The link closed during the handshake'), '');
    const timer = setTimeout(
      () => finish(new Error('The link handshake timed out'), ''),
      HANDSHAKE_TIMEOUT_MS
    );
    socket.on('data', onData);
    socket.once('close', onClose);
    socket.resume();
  });
}

export async function openLink(linkFile: string, secret: string): Promise<Socket> {
  const link = linkSchema.safeParse(parseJson((await readOptional(linkFile)) ?? ''));
  if (!link.success) throw new Error('No VS Code window is serving Pocket Pilot');
  const { port } = link.data;
  const socket = connect({ host: LOOPBACK, port, allowHalfOpen: true });
  try {
    await once(socket, 'connect');
    socket.on('error', () => socket.destroy());
    const nonce = newNonce();
    socket.write(`${nonce}\n`);
    const [leaderProof = '', leaderNonce = ''] = (await readLine(socket)).split(' ');
    if (!validProof(secret, 'origin', port, nonce, leaderProof)) {
      throw new Error('The window failed the link check');
    }
    socket.write(`${proof(secret, 'keeper', port, leaderNonce)}\n`);
    if ((await readLine(socket)) !== READY) throw new Error('The window refused the link');
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

export async function serveLink(
  origin: HttpServer,
  secret: string,
  linkFile: string
): Promise<OriginLink> {
  const sockets = new Set<Socket>();
  const accept = async (socket: Socket): Promise<void> => {
    const port = socket.localPort ?? 0;
    const keeperNonce = await readLine(socket);
    const nonce = newNonce();
    socket.write(`${proof(secret, 'origin', port, keeperNonce)} ${nonce}\n`);
    if (!validProof(secret, 'keeper', port, nonce, await readLine(socket))) {
      throw new Error('The keeper failed the link check');
    }
    socket.write(`${READY}\n`);
  };
  const server = createServer({ allowHalfOpen: true, pauseOnConnect: true }, (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    accept(socket).then(
      () => {
        socket.resume();
        origin.emit('connection', socket);
      },
      () => socket.destroy()
    );
  });
  server.listen({ host: LOOPBACK, port: 0 });
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('The tunnel link has no port');
  }
  try {
    await writeAtomic(linkFile, JSON.stringify({ port: address.port }));
  } catch (error) {
    server.close();
    throw error;
  }

  return {
    close: async () => {
      const closed = once(server, 'close');
      server.close();
      for (const socket of sockets) socket.destroy();
      await closed;
    }
  };
}

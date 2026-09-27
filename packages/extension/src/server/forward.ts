import { createServer, type Server } from 'node:http';

export function forwardTo(target: Server): Server {
  return createServer()
    .on('request', (request, response) => target.emit('request', request, response))
    .on('upgrade', (request, socket, head) => target.emit('upgrade', request, socket, head));
}

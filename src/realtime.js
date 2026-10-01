import { Server } from 'socket.io';

let io = null;

export function attachRealtime(httpServer) {
  io = new Server(httpServer);
  io.on('connection', socket => socket.emit('connected', { ok: true }));
  return io;
}

/** Emit to all clients. No-op until attachRealtime() has run (e.g. in tests). */
export function broadcast(event, payload) {
  io?.emit(event, payload);
}

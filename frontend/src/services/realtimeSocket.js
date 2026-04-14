import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:8000';
let socket = null;

export function getRealtimeSocket() {
  const token = localStorage.getItem('token') || '';
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    return null;
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    return socket;
  }

  socket.auth = { token };
  if (!socket.connected) socket.connect();
  return socket;
}


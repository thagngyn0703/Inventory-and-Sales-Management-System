import { io } from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '');
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


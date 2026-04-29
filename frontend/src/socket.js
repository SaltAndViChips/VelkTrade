import { io } from 'socket.io-client';
import { API_URL, getToken } from './api';

export function createSocket() {
  return io(API_URL, {
    auth: {
      token: getToken()
    }
  });
}

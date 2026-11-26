import api from '../services/api';

export const getWebRtcIceServers = () => [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const loadWebRtcIceServers = async () => {
  const response = await api.get('/voice/ice-servers', { timeout: 12000 });
  const servers = response.data?.data;
  if (response.data?.success !== true || !Array.isArray(servers) || !servers.some(
    (server) => [].concat(server.urls || []).some((url) => /^turns?:/.test(url))
  )) {
    throw new Error('The call connection service is unavailable. Please try again shortly.');
  }
  return servers;
};

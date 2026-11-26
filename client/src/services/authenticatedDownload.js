import api from './api';

export async function downloadAuthenticatedFile(path, filename) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || new URL(path, window.location.origin).origin !== window.location.origin) throw Error('Invalid file path.');
  const response = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = String(filename || 'download').replace(/[\\/:*?"<>|\r\n]/g, '_');
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

import React, { useEffect, useState } from 'react';
import api from '../../services/api';

export default function UserAvatar({ photo, name, className = '', ...props }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, objectUrl = '';
    setUrl(''); setFailed(false);
    const filename = String(photo || '').match(/^\/uploads\/passports\/(passport_\d+_[A-Za-z0-9_.-]+)$/)?.[1];
    if (filename) api.get(`/users/passport-photo/${encodeURIComponent(filename)}`, { responseType: 'blob' }).then(response => {
      if (!active) return;
      objectUrl = URL.createObjectURL(response.data); setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo]);
  return url && !failed ? <img {...props} src={url} alt="" className={className} onError={() => setFailed(true)} /> : <span {...props} className={`inline-flex items-center justify-center bg-blue-900 text-white ${className}`}>{String(name || 'U').trim().charAt(0).toUpperCase()}</span>;
}

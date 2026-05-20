import React, { useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';

const OnlineStatusBadge = ({
  userId,
  onlineLabel = 'Online',
  offlineLabel = 'Offline',
  className = '',
}) => {
  const { connected, isUserOnline, requestPresence } = useSocket();
  const online = isUserOnline(userId);

  useEffect(() => {
    if (userId) {
      requestPresence([userId]);
    }
  }, [requestPresence, userId]);

  if (!userId) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
        online
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-600'
      } ${className}`}
      title={connected ? undefined : 'Realtime connection is offline'}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          online ? 'bg-green-500' : 'bg-gray-400'
        }`}
      />
      {online ? onlineLabel : offlineLabel}
    </span>
  );
};

export default OnlineStatusBadge;

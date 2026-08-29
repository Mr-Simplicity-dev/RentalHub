import React, { useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useTranslation } from 'react-i18next';

const OnlineStatusBadge = ({ userId, className = '' }) => {
  const { t } = useTranslation();
  const { connected, isUserOnline, requestPresence } = useSocket();
  const onlineLabel = t('online_status.online', 'Online');
  const offlineLabel = t('online_status.offline', 'Offline');
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
      title={connected ? undefined : t('online_status.realtime_offline', 'Realtime connection is offline')}
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

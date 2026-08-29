import React from 'react';
import { FaPhone, FaPhoneSlash, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const CallNotification = ({
  incomingCall,
  outgoingCall,
  activeCallNotice,
  onAccept,
  onReject,
  onEnd,
}) => {
  const { t } = useTranslation();

  const callLabel = (call) => {
    if (!call) return t('call_notification.call', 'Call');
    if (call.callType === 'virtual_tour') return t('call_notification.virtual_tour_request', 'Virtual tour request');
    if (call.callType === 'video') return t('call_notification.video_call', 'Video call');
    return t('call_notification.audio_call', 'Audio call');
  };

  const call = incomingCall || outgoingCall || activeCallNotice;

  if (!call) return null;

  const isIncoming = Boolean(incomingCall);
  const isOutgoing = Boolean(outgoingCall);
  const isAcceptedNotice = Boolean(activeCallNotice);
  const title = isIncoming
    ? t('call_notification.incoming', 'Incoming {{label}}', {
        label: callLabel(call).toLowerCase(),
      })
    : isAcceptedNotice
      ? t('call_notification.accepted', '{{label}} accepted', { label: callLabel(call) })
      : call.callType === 'virtual_tour'
        ? t('call_notification.requesting_virtual_tour', 'Requesting virtual tour from {{name}}', {
            name: call.receiver?.full_name || t('call_notification.receiver', 'receiver'),
          })
        : t('call_notification.calling', 'Calling {{name}}', {
            name: call.receiver?.full_name || t('call_notification.receiver', 'receiver'),
          });

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[120] mx-auto max-w-md rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl sm:left-auto sm:right-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <FaPhone />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-sm text-gray-600">
            {isIncoming
              ? call.callType === 'virtual_tour'
                ? t('call_notification.requesting_property_tour', '{{name}} is requesting a live property tour.', {
                    name: call.caller?.full_name || t('call_notification.a_user', 'A user'),
                  })
                : t('call_notification.wants_to_connect', '{{name}} wants to connect with you.', {
                    name: call.caller?.full_name || t('call_notification.a_user', 'A user'),
                  })
              : isAcceptedNotice
                ? t('call_notification.accepted_notice', 'The call request has been accepted.')
                : t('call_notification.waiting_for_receiver', 'Waiting for the receiver to accept.')}
          </p>

          {call.propertyTitle && (
            <p className="mt-2 truncate rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-600">
              {t('call_notification.property', 'Property: {{title}}', { title: call.propertyTitle })}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {isIncoming && (
              <>
                <button
                  type="button"
                  onClick={() => onAccept(call.callId)}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
                >
                  <FaPhone className="text-xs" />
                  {t('call_notification.accept', 'Accept')}
                </button>
                <button
                  type="button"
                  onClick={() => onReject(call.callId)}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  <FaPhoneSlash className="text-xs" />
                  {t('call_notification.reject', 'Reject')}
                </button>
              </>
            )}

            {(isOutgoing || isAcceptedNotice) && (
              <button
                type="button"
                onClick={() => onEnd(call.callId)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <FaTimes className="text-xs" />
                {isOutgoing
                  ? t('call_notification.cancel', 'Cancel')
                  : t('call_notification.close', 'Close')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallNotification;

import React from 'react';
import { FaPhone, FaPhoneSlash, FaTimes } from 'react-icons/fa';

const callLabel = (call) => {
  if (!call) return 'Call';
  if (call.callType === 'virtual_tour') return 'Virtual tour request';
  if (call.callType === 'video') return 'Video call';
  return 'Audio call';
};

const CallNotification = ({
  incomingCall,
  outgoingCall,
  activeCallNotice,
  onAccept,
  onReject,
  onEnd,
}) => {
  const call = incomingCall || outgoingCall || activeCallNotice;

  if (!call) return null;

  const isIncoming = Boolean(incomingCall);
  const isOutgoing = Boolean(outgoingCall);
  const isAcceptedNotice = Boolean(activeCallNotice);
  const title = isIncoming
    ? `Incoming ${callLabel(call).toLowerCase()}`
    : isAcceptedNotice
      ? `${callLabel(call)} accepted`
      : call.callType === 'virtual_tour'
        ? `Requesting virtual tour from ${call.receiver?.full_name || 'receiver'}`
        : `Calling ${call.receiver?.full_name || 'receiver'}`;

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
                ? `${call.caller?.full_name || 'A user'} is requesting a live property tour.`
                : `${call.caller?.full_name || 'A user'} wants to connect with you.`
              : isAcceptedNotice
                ? 'The call request has been accepted.'
                : 'Waiting for the receiver to accept.'}
          </p>

          {call.propertyTitle && (
            <p className="mt-2 truncate rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-600">
              Property: {call.propertyTitle}
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
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => onReject(call.callId)}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  <FaPhoneSlash className="text-xs" />
                  Reject
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
                {isOutgoing ? 'Cancel' : 'Close'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallNotification;

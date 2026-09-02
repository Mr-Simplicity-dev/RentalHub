// Shared voice labels used by the Voice Desk and the Voice Operations panel.
// Neutral hierarchy: Local = blue, Toll-free = cyan, International = violet,
// Unknown = gray.

export const ORIGIN_META = {
  local_termii: {
    label: 'Local call',
    detail: 'Nigeria · Termii SIP',
    tone: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  toll_free: {
    label: 'Toll-free call',
    detail: 'Nigeria · Toll-free',
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  },
  international_twilio: {
    label: 'International call',
    detail: 'International · Twilio',
    tone: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  unknown: {
    label: 'Inbound call',
    detail: 'Route unavailable',
    tone: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

export const getOriginMeta = (source) =>
  ORIGIN_META[source] || ORIGIN_META.unknown;

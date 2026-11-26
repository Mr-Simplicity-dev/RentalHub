function createCallSoundSession({ loadSettings, play, onBlocked = () => {}, timers = globalThis }) {
  let current = null;
  const stop = () => {
    const old = current;
    current = null;
    if (old?.timer) timers.clearTimeout(old.timer);
    old?.stop?.();
  };
  const start = async (key, direction, expiresAt) => {
    if (current?.key === key) return;
    stop();
    const remaining = Math.min(45000, Date.parse(expiresAt) - Date.now());
    if (!(remaining > 0)) return;
    const session = { key };
    current = session;
    session.timer = timers.setTimeout(stop, remaining);
    try {
      const settings = await loadSettings();
      if (current !== session || !settings.policy.enabled) return;
      const sound = direction === 'outgoing'
        ? settings.policy.ringbackEnabled ? 'ringback' : 'silent'
        : settings.effectiveSound;
      if (!['normal', 'greeting', 'ringback'].includes(sound)) return;
      const playback = await play(sound);
      if (current !== session) playback.stop();
      else { session.stop = playback.stop; onBlocked(false); }
    } catch { if (current === session) onBlocked(true); }
  };
  return { start, stop };
}
const ringingExpiry = (call, now = Date.now()) => {
  if (call.expiresAt) return call.expiresAt;
  const created = Date.parse(call.createdAt);
  return new Date((Number.isFinite(created) ? created : now) + 45000).toISOString();
};
module.exports = { createCallSoundSession, ringingExpiry };

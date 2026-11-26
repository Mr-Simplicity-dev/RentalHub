const createCallSignalBuffer = () => {
  const calls = new Map();
  const add = (callId, candidate) => {
    if (!callId || !candidate) return;
    const state = calls.get(callId) || { candidates: [], draining: null };
    if (state.candidates.length < 128) state.candidates.push(candidate);
    calls.set(callId, state);
  };
  const drain = (callId, peer, Candidate) => {
    const state = calls.get(callId);
    if (!state || !peer?.remoteDescription?.type) return Promise.resolve();
    if (state.draining) return state.draining;
    state.draining = (async () => {
      while (state.candidates.length && calls.get(callId) === state && peer.signalingState !== 'closed') {
        const candidate = state.candidates.shift();
        await peer.addIceCandidate(new Candidate(candidate));
      }
    })().finally(() => { state.draining = null; });
    return state.draining;
  };
  return { add, drain, clear: () => calls.clear() };
};
module.exports = { createCallSignalBuffer };

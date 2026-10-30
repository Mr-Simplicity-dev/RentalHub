let libraries;
const script = (src, ready) => ready() ? Promise.resolve() : new Promise((resolve, reject) => {
  const element = document.createElement('script');
  element.src = src;
  element.onload = () => ready() ? resolve() : reject(new Error('Reader software could not load.'));
  element.onerror = () => { element.remove(); reject(new Error('Unable to load reader software.')); };
  document.head.appendChild(element);
});
const load = () => {
  if (!libraries) libraries = script('/vendor/digitalpersona/websdk.client.js', () => Boolean(window.WebSdk))
    .then(() => script('/vendor/digitalpersona/fingerprint.sdk.js', () => Boolean(window.Fingerprint?.WebApi)))
    .catch(error => { libraries = null; throw error; });
  return libraries;
};
export const normalizePngSample = value => {
  if (typeof value !== 'string' || value.length > 550000) throw new Error('The reader returned an invalid sample. Please scan again.');
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  // HID versions may return PNG bytes or a base64-encoded base64 PNG string.
  if (!base64.startsWith('iVBORw0KGgo')) base64 = window.atob(base64).replace(/^data:image\/png;base64,/, '').replace(/-/g, '+').replace(/_/g, '/');
  base64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  if (!base64.startsWith('iVBORw0KGgo') || base64.length > 400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('The reader returned no usable PNG image. Please scan again.');
  return base64;
};
export const captureOfficeFingerprint = async signal => {
  await load();
  if (signal?.aborted) throw new Error('Scan cancelled.');
  return new Promise((resolve, reject) => {
    const reader = new window.Fingerprint.WebApi();
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reader.off();
      reader.stopAcquisition().catch(() => {});
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(new Error('Scan cancelled.'));
    const timer = setTimeout(() => finish(new Error('Scan timed out. Check the reader and try again.')), 30000);
    signal?.addEventListener('abort', abort, { once: true });
    reader.on('SamplesAcquired', event => {
      try {
        const samples = typeof event.samples === 'string' ? JSON.parse(event.samples) : event.samples;
        finish(null, normalizePngSample(samples?.[0]));
      } catch (error) { finish(error); }
    });
    reader.on('CommunicationFailed', () => finish(new Error('Cannot connect to the HID client. Use the office Windows computer with the reader connected.')));
    reader.on('ErrorOccurred', () => finish(new Error('The reader could not capture this fingerprint. Please try again.')));
    reader.on('DeviceDisconnected', () => finish(new Error('The fingerprint reader was disconnected.')));
    reader.startAcquisition(window.Fingerprint.SampleFormat.PngImage).catch(() => finish(new Error('Unable to start the reader. Check the HID client and browser local-device permission.')));
  });
};

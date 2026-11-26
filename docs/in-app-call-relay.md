# In-app call connection

This flow is separate from the Twilio telephone/IVR service. Existing call permissions and dispute conversations are unchanged.

## Connection

After acceptance, web and mobile fetch `GET /api/voice/ice-servers` with their normal signed-in session. They wait for microphone/camera preparation and retain early ICE candidates until the remote description is ready. Ending a call invalidates pending media preparation and stops late tracks.

The endpoint is authenticated, rate limited and sends `Cache-Control: no-store, private`. It generates one-hour HMAC credentials from `/etc/rentalhub/turn.json`, or uses existing server `TURN_*` settings. The shared signing secret is never returned or bundled in web/mobile builds. Only explicitly configured TURN/TURNS endpoints are returned; a TLS endpoint is never guessed.

## Existing VPS relay

Coturn runs as its own restricted service. Call ports are 3478 TCP/UDP and 49160-49260 UDP. The service requires short-lived credentials, denies private/loopback/multicast peer destinations, disables its administration listener and limits allocation count/bandwidth. These direct TURN endpoints use the server IP and are not sent through the website's Cloudflare proxy. WebRTC media remains encrypted by WebRTC. Networks that block these ports may still need a separately configured TURN-over-TLS endpoint; none is falsely advertised.

Private configuration (not in Git):

- `/etc/rentalhub/turn.json`: `urls` and `secret`, mode 0600.
- `/etc/turnserver.conf`: matching authentication secret and relay settings, mode 0640, root:turnserver.

No database migration, new VPS, payment provider or production `.env` edit is needed.

## Verification

- Backend: `node --test tests/webrtcIceService.test.js tests/callDirectoryService.test.js`
- Web: `npm --prefix client test -- --run src/context/SocketContext.calls.test.jsx src/components/calls/HeadphoneSupportButton.test.jsx`
- Mobile source: `node --test scripts/test-call-connection.cjs` in RentalHubMobile.
- Relay: bounded `turnutils_uclient` tests with separate temporary identities for UDP and TCP; check sent/received counts and packet loss. Never use a customer identity or print credentials.

Android 1.0.71/build 82 predates the mobile connection changes. Server/web fixes can help calls with an updated web participant. The mobile-side timing and runtime-relay changes need a new explicitly authorised APK build; iOS needs a normal release too. Do not claim a successful two-phone call until it is actually tested.

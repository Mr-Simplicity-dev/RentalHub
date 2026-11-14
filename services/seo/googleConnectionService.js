const crypto = require('crypto');
const {
  google
} = require('googleapis');
const {
  fail,
  text,
  hash,
  providerError
} = require('./core');
const READ = 'https://www.googleapis.com/auth/webmasters.readonly',
  WRITE = 'https://www.googleapis.com/auth/webmasters',
  ADS = 'https://www.googleapis.com/auth/adwords';
function createGoogleConnections({
  store,
  env = process.env,
  OAuth2 = google.auth.OAuth2,
  audit = async () => {},
  frontend = () => require('../../config/utils/frontendUrl').getFrontendUrl()
}) {
  const clients = new Map();
  const key = () => {
    if (!/^[a-f0-9]{64}$/i.test(env.SEO_TOKEN_ENCRYPTION_KEY || '')) fail(503, 'SEO_ENCRYPTION_NOT_CONFIGURED', 'Configure the dedicated SEO token encryption key on the backend.');
    return Buffer.from(env.SEO_TOKEN_ENCRYPTION_KEY, 'hex');
  };
  const seal = (value, purpose) => {
    const iv = crypto.randomBytes(12),
      cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    cipher.setAAD(Buffer.from('rentalhub-seo:' + purpose));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  };
  const open = (value, purpose) => {
    try {
      const [version, iv, tag, data] = String(value).split('.');
      if (version !== 'v1') throw Error();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from('rentalhub-seo:' + purpose));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString());
    } catch {
      fail(503, 'SEO_CREDENTIALS_UNREADABLE', 'The saved Google credentials cannot be opened. Check the encryption key or reconnect.');
    }
  };
  const checkProvider = provider => {
    if (!['search_console', 'google_ads'].includes(provider)) fail(400, 'INVALID_PROVIDER', 'Choose Search Console or Google Ads.');
  };
  const config = () => {
    const missing = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_SEARCH_CONSOLE_REDIRECT_URI'].filter(k => !env[k]);
    if (!/^[a-f0-9]{64}$/i.test(env.SEO_TOKEN_ENCRYPTION_KEY || '')) missing.push('SEO_TOKEN_ENCRYPTION_KEY');
    return missing;
  };
  const client = () => {
    if (config().length) fail(503, 'GOOGLE_SETUP_REQUIRED', 'Configure Google OAuth and SEO encryption on the backend first.');
    let uri;
    try {
      uri = new URL(env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI);
    } catch {
      fail(503, 'GOOGLE_SETUP_REQUIRED', 'The configured Google callback URL is invalid.');
    }
    if (uri.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && uri.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(uri.hostname))) fail(503, 'GOOGLE_SETUP_REQUIRED', 'The Google callback must use HTTPS.');
    return new OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET, uri.href);
  };
  const connection = async provider => {
    checkProvider(provider);
    return (await store.query('SELECT * FROM seo_integrations WHERE provider=$1', [provider])).rows[0];
  };
  const status = async () => {
    const rows = (await store.query('SELECT provider,status,property_url,account_label,scopes,last_sync_at,error_code,connected_at FROM seo_integrations ORDER BY provider')).rows;
    return rows.map(row => {
      const missing = config();
      if (row.provider === 'google_ads') for (const k of ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_API_VERSION']) if (!env[k]) missing.push(k);
      return {
        ...row,
        connected: row.status === 'connected',
        oauth_ready: config().length === 0,
        provider_ready: missing.length === 0,
        missing
      };
    });
  };
  const start = async (provider, actor, {
    sitemapWrite = false
  } = {}) => {
    checkProvider(provider);
    if (actor?.user_type !== 'super_admin') fail(403, 'SUPER_ADMIN_REQUIRED', 'Super Admin access is required.');
    const oauth = client(),
      current = await connection(provider);
    const verifier = crypto.randomBytes(48).toString('base64url'),
      state = crypto.randomBytes(32).toString('base64url'),
      scopes = provider === 'google_ads' ? [ADS] : [sitemapWrite ? WRITE : READ];
    await store.query('DELETE FROM seo_oauth_states WHERE expires_at<NOW()');
    await store.query('INSERT INTO seo_oauth_states(state_hash,provider,user_id,token_version,connection_version,verifier_encrypted,requested_scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW()+INTERVAL \'15 minutes\')', [hash(state), provider, actor.id, actor.token_version || 1, current.version, seal(verifier, provider + ':state'), JSON.stringify(scopes)]);
    await audit({
      actorId: actor.id,
      action: 'SEO_GOOGLE_CONNECTION_STARTED',
      targetType: provider
    });
    return {
      url: oauth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: scopes,
        state,
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256'
      })
    };
  };
  const callback = async ({
    state,
    code,
    error
  }) => {
    if (!state || text(state, 200) !== state) fail(400, 'OAUTH_STATE_INVALID', 'Google connection expired. Start again from SEO settings.');
    const row = (await store.query('DELETE FROM seo_oauth_states WHERE state_hash=$1 AND expires_at>NOW() RETURNING *', [hash(state)])).rows[0];
    if (!row) fail(400, 'OAUTH_STATE_INVALID', 'Google connection expired or was already used.');
    const actor = (await store.query('SELECT id,user_type,token_version,is_active,deleted_at FROM users WHERE id=$1', [row.user_id])).rows[0];
    if (!actor || actor.user_type !== 'super_admin' || actor.is_active !== true || actor.deleted_at || Number(actor.token_version || 1) !== Number(row.token_version)) fail(403, 'OAUTH_SESSION_CHANGED', 'Sign in again as Super Admin before connecting Google.');
    if (error || !code) fail(400, 'GOOGLE_ACCESS_NOT_GRANTED', 'Google access was not granted.');
    const oauth = client();
    let tokens;
    try {
      ({
        tokens
      } = await oauth.getToken({
        code,
        codeVerifier: open(row.verifier_encrypted, row.provider + ':state')
      }));
    } catch (e) {
      throw providerError(e);
    }
    const scopes = String(tokens.scope || '').split(/\s+/).filter(Boolean);
    if (!row.requested_scopes.every(scope => scopes.includes(scope))) fail(403, 'GOOGLE_SCOPE_NOT_GRANTED', 'Google did not grant the requested permission. Try connecting again.');
    if (!tokens.refresh_token) fail(400, 'GOOGLE_OFFLINE_ACCESS_REQUIRED', 'Google did not return offline access. Remove the old RentalHub grant in your Google account and reconnect.');
    const saved = await store.query("UPDATE seo_integrations SET credentials_encrypted=$2,scopes=$3::jsonb,status='connected',error_code=NULL,version=version+1,connected_by=$4,connected_at=NOW(),updated_at=NOW() WHERE provider=$1 AND version=$5 RETURNING provider", [row.provider, seal({
      refresh_token: tokens.refresh_token
    }, row.provider), JSON.stringify(scopes), actor.id, row.connection_version]);
    if (!saved.rows.length) fail(409, 'GOOGLE_CONNECTION_CHANGED', 'The connection changed while Google was open. Please start again.');
    clients.delete(row.provider);
    await audit({
      actorId: actor.id,
      action: 'SEO_GOOGLE_CONNECTED',
      targetType: row.provider
    });
    return {
      provider: row.provider,
      returnUrl: frontend() + '/super-admin/seo?google=connected'
    };
  };
  const request = async (provider, options) => {
    const c = await connection(provider);
    if (c?.status !== 'connected' || !c.credentials_encrypted) fail(409, 'GOOGLE_NOT_CONNECTED', 'Connect the Google account from SEO settings first.');
    let cached = clients.get(provider);
    if (!cached || cached.version !== c.version) {
      const oauth = client();
      oauth.setCredentials(open(c.credentials_encrypted, provider));
      cached = {
        version: c.version,
        oauth
      };
      clients.set(provider, cached);
    }
    try {
      return await cached.oauth.request({
        ...options,
        timeout: 20000
      });
    } catch (e) {
      if (e.response?.data?.error === 'invalid_grant') {
        await store.query("UPDATE seo_integrations SET status='reconnect_required',error_code='GOOGLE_GRANT_REVOKED',version=version+1 WHERE provider=$1 AND version=$2", [provider, c.version]);
        clients.delete(provider);
      }
      throw providerError(e, provider);
    }
  };
  const disconnect = async (provider, actor) => {
    const c = await connection(provider);
    await store.transaction(async tx => {
      await tx.query("UPDATE seo_integrations SET credentials_encrypted=NULL,status='disconnected',version=version+1,error_code=NULL,updated_at=NOW() WHERE provider=$1", [provider]);
      await tx.query('DELETE FROM seo_oauth_states WHERE provider=$1', [provider]);
      await tx.query("UPDATE seo_sync_runs SET status='cancelled',completed_at=NOW() WHERE provider=$1 AND status IN ('queued','running','retry')", [provider]);
    });
    clients.delete(provider);
    let revoked = false;
    if (c?.credentials_encrypted) {
      try {
        await client().revokeToken(open(c.credentials_encrypted, provider).refresh_token);
        revoked = true;
      } catch {
        await store.query("UPDATE seo_integrations SET error_code='REMOTE_REVOCATION_UNCONFIRMED' WHERE provider=$1 AND status='disconnected'", [provider]);
      }
    }
    await audit({
      actorId: actor.id,
      action: 'SEO_GOOGLE_DISCONNECTED',
      targetType: provider
    });
    return {
      disconnected: true,
      google_revocation_confirmed: revoked
    };
  };
  return {
    status,
    start,
    callback,
    request,
    connection,
    disconnect,
    seal,
    open,
    scopes: {
      READ,
      WRITE,
      ADS
    }
  };
}
module.exports = {
  createGoogleConnections
};

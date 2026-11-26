const fs = require('fs');
const crypto = require('crypto');
const CONFIG_PATH = '/etc/rentalhub/turn.json';
const buildIceServers = ({ userId, env = process.env, now = Date.now(), readFile = fs.readFileSync } = {}) => {
  let privateConfig = {};
  try { privateConfig = JSON.parse(readFile(CONFIG_PATH, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const urls = [].concat(env.TURN_URL || privateConfig.urls || []).flatMap(value => String(value).split(',')).map(value => value.trim()).filter(value => /^turns?:[^\s]+$/i.test(value));
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  if (!urls.length) return servers;
  const secret = env.TURN_AUTH_SECRET || privateConfig.secret;
  let username, credential;
  if (secret) {
    if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) throw new Error('Authenticated user required');
    username = `${Math.floor(now / 1000) + 3600}:${userId}:${crypto.randomBytes(8).toString('hex')}`;
    credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  } else {
    username = env.TURN_USERNAME;
    credential = env.TURN_PASSWORD;
    if (!username || !credential) return servers;
  }
  servers.push({ urls: [...new Set(urls)], username, credential });
  return servers;
};
const iceServersHandler = (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  try { return res.json({ success: true, data: buildIceServers({ userId: req.user?.id }) }); }
  catch { return res.status(503).json({ success: false, message: 'The call connection service is temporarily unavailable.' }); }
};
module.exports = { buildIceServers, iceServersHandler };

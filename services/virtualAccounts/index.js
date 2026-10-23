const providers = {
  monnify: require('./monnify'),
  palmpay: require('./palmpay'),
};

const PROVIDER_NAMES = Object.keys(providers);

const resolveProviderName = () => {
  const requested = String(process.env.VIRTUAL_ACCOUNT_PROVIDER || 'monnify').trim().toLowerCase();
  return providers[requested] ? requested : 'monnify';
};

// Null when payment accounts are switched off or the selected provider has no
// credentials yet. Every caller treats null as "use the manual transfer flow".
const getProvider = (name) => {
  if (String(process.env.VIRTUAL_ACCOUNTS_ENABLED || '').toLowerCase() !== 'true') {
    return null;
  }

  const provider = providers[String(name || resolveProviderName()).toLowerCase()];
  if (!provider || !provider.isConfigured()) return null;
  return provider;
};

const getProviderOrThrow = (name) => {
  const provider = getProvider(name);
  if (provider) return provider;

  const error = new Error('Automatic bank-transfer accounts are not enabled');
  error.statusCode = 503;
  error.code = 'VIRTUAL_ACCOUNTS_DISABLED';
  throw error;
};

const getProviderByName = (name) => providers[String(name || '').toLowerCase()] || null;

module.exports = {
  PROVIDER_NAMES,
  resolveProviderName,
  getProvider,
  getProviderOrThrow,
  getProviderByName,
};

// MOCKED — in-memory, data lost on container sleep
const store = new Map();

const redis = {
  get: async (k) => store.get(k) ?? null,
  set: async (k, v) => {
    store.set(k, v);
    return 'OK';
  },
  del: async (k) => store.delete(k),
  incr: async (k) => {
    const n = (Number(store.get(k)) || 0) + 1;
    store.set(k, n);
    return n;
  },
  decr: async (k) => {
    const n = Math.max((Number(store.get(k)) || 0) - 1, 0);
    store.set(k, n);
    return n;
  },
  expire: async () => 1,
  pexpire: async () => 1,
  ping: async () => 'PONG',
  connect: async () => {},
  quit: async () => 'OK',
};

module.exports = redis;

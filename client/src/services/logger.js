const IS_DEV = process.env.NODE_ENV === 'development';

export const logger = {
  error: (...args) => {
    if (IS_DEV) {
      console.error(...args);
    }
  },
  warn: (...args) => {
    if (IS_DEV) {
      console.warn(...args);
    }
  },
  log: (...args) => {
    if (IS_DEV) {
      console.log(...args);
    }
  },
};

const createMfaVerification = ({ requestCode, verify }) => {
  let pending = null;
  let generation = 0;
  const ensure = async (requestGeneration, initialMessage) => {
    if (requestGeneration < generation) return;
    if (!pending) {
      pending = (async () => {
        let message = initialMessage;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const code = await requestCode(message);
          try {
            await verify(code);
            generation += 1;
            return;
          } catch (error) {
            if (error.response?.data?.code !== 'TOTP_INVALID' || attempt === 2) throw error;
            message = error.response.data.message;
          }
        }
      })().finally(() => { pending = null; });
    }
    return pending;
  };
  return { ensure, generation: () => generation };
};
module.exports = { createMfaVerification };

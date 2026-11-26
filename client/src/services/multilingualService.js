import api from './api';

export const multilingualService = {
  getConfig: async () => {
    const response = await api.get('/multilingual/config');
    return response.data;
  },
};

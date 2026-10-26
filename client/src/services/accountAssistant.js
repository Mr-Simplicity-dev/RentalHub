import api from './api';
export const askAccountAssistant = async (message, options={}) => (await api.post('/support/assistant',{message,...options})).data.data;
export const submitAssistantTicket = async draft => {const response=await api.post('/support/tickets',draft);const ticket=response.data?.data;if(!response.data?.success || !ticket?.id)throw new Error('Ticket creation could not be confirmed');return ticket;};
export const needsAccount = text => !/^(how (do|can) i (find|list|register|create|search)|how to (find|list|register))/i.test(text) && /\b(my|mine|balance|status|pending|withdrawal|ticket|complaint|who am i)\b/i.test(text);

export const askPublicAssistant = async (message, options={}) => (await api.post('/support/assistant/public',{message,...options})).data.data;

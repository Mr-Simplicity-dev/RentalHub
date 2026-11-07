import React,{useEffect,useState} from 'react';
import {useParams,useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {useAuth} from '../hooks/useAuth';
import {useSocket} from '../hooks/useSocket';
import api from '../services/api';
import Support from './Support';
import TicketConversationModal from '../components/common/TicketConversationModal';
export default function SupportTicketEntry(){
 const {ticketId}=useParams(),navigate=useNavigate(),{user}=useAuth(),{socket}=useSocket(),{t}=useTranslation();
 const [ticket,setTicket]=useState(null),[error,setError]=useState(''),[loadedFor,setLoadedFor]=useState('');
 useEffect(()=>{let active=true;setTicket(null);setError('');setLoadedFor('');if(!/^\d+$/.test(ticketId||'')){setError(t('support.load_tickets_failed'));return;}api.get(`/support/tickets/${ticketId}/context`).then(response=>{if(active){setTicket(response.data?.data?.ticket||null);setLoadedFor(String(user?.id)+':'+ticketId);}}).catch(e=>{if(active)setError(e.response?.data?.message||t('support.load_tickets_failed'));});return()=>{active=false;};},[ticketId,user?.id,t]);
 if(error)return <main className="p-6"><p role="alert">{error}</p></main>;
 if(!ticket||loadedFor!==String(user?.id)+':'+ticketId)return <main className="p-6">{t('common.loading','Loading...')}</main>;
 if(['tenant','landlord'].includes(user?.user_type))return <Support key={user.id} initialTicketId={Number(ticketId)}/>;
 return <TicketConversationModal ticket={ticket} user={user} socket={socket} onClose={()=>navigate('/dashboard')} onTicketUpdated={setTicket}/>;
}

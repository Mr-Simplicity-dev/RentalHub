import React from 'react';
import {useTranslation} from 'react-i18next';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import copy from '../../utils/registrationEmailCopy.cjs';
export const rememberRegistrationEmail=data=>{if(!data?.user?.id||!data.email_verification)return;try{sessionStorage.setItem('rentalhub.registration-email:'+data.user.id,JSON.stringify({sent:data.email_verification.sent===true}));}catch{}};
export default function EmailVerificationNotice(){const {user}=useAuth(),{i18n}=useTranslation();const text=copy[i18n.resolvedLanguage||i18n.language]||copy.en;let delivery=null;try{delivery=JSON.parse(sessionStorage.getItem('rentalhub.registration-email:'+user?.id));}catch{}
 if(!['tenant','landlord'].includes(user?.user_type)||!user.email||user.email_verified===true)return null;
 return <section role="status" className="mb-6 rounded-2xl border border-primary-200 bg-primary-50 p-5 text-primary-950"><h2 className="text-lg font-semibold">{text.title}</h2><p className="mt-2 break-words text-sm leading-6">{delivery?.sent===true?text.sent.replace('{{email}}',user.email):delivery?.sent===false?text.failed:text.pending}</p><p className="mt-1 text-sm leading-6">{text.help}</p><Link className="btn btn-primary mt-4 inline-flex min-h-11" to="/verify-email" state={{email:user.email}}>{text.action}</Link></section>;
}

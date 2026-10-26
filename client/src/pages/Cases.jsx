import React from 'react';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {useAuth} from '../hooks/useAuth';
import PublicResolvedCases from '../components/legal/PublicResolvedCases';
export default function Cases(){
 const {t}=useTranslation();const {isAuthenticated}=useAuth();
 return <div className="min-h-screen bg-slate-50"><section data-tour-id="public-cases-overview" className="bg-slate-900 px-4 py-12 text-white"><div className="mx-auto max-w-6xl"><h1 className="text-3xl font-semibold sm:text-4xl">{t('legalCases.title')}</h1><p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">{t('legalCases.intro')}</p></div></section><div className="mx-auto max-w-6xl px-4 py-8"><PublicResolvedCases/><section className="rounded-2xl border border-blue-200 bg-blue-50 p-6"><h2 className="text-lg font-semibold text-slate-900">{t('legalCases.assistance')}</h2><Link to={isAuthenticated?'/assistance':'/login'} className="btn btn-primary mt-4">{t(isAuthenticated?'legalCases.request':'legalCases.sign_in')}</Link></section></div></div>;
}

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import useProtectionText from '../../i18n/useProtectionText';
import { entryFor } from '../../propertyProtection/workflow.cjs';
export default function PropertyProtectionEntry(){const {user}=useAuth();const ui=useProtectionText(user),entry=entryFor(user);if(!entry)return null;return <section className="my-4 rounded-xl border border-slate-200 bg-white p-4"><Link to={entry.path} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"><span className="block font-semibold text-slate-900">{ui(entry.title)}</span><span className="mt-1 block text-sm text-slate-600">{ui(entry.description)}</span></Link></section>;}

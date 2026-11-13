import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languages, PIDGIN, LEVELS } from '../../data/languagePolicy';
export default function LanguageSkillsField({
  value = [],
  onChange,
  preference = false,
  english = false
}) {
  const {
    t: translate
  } = useTranslation();
  const t = (key, fallback) => english ? fallback : translate(key, fallback);
  const [query, setQuery] = useState('');
  const options = useMemo(() => languages.filter(x => x.name.toLowerCase().includes(query.toLowerCase())), [query]);
  const selected = Array.isArray(value) ? value : [];
  const update = (id, field, v) => onChange(selected.map(x => x.language_id === id ? {
    ...x,
    [field]: v
  } : x));
  return <fieldset className="min-w-0 space-y-3 rounded-xl border border-slate-300 p-4 lg:col-span-2"><legend className="px-1 font-semibold">{t(preference ? 'support.preferred_language' : 'careers.language_skills', preference ? 'Which language would you like us to use?' : 'Languages you understand and can speak')}</legend>
 {!preference && <p className="text-sm">{t('careers.language_rule', 'Select 2 to 5 languages, including Nigerian Pidgin. Give honest skill levels. Recruitment will check them.')} ({selected.length}/5)</p>}
 <label className="block text-sm">{t('careers.language_search', 'Search languages')}<input className="mt-1 w-full rounded border p-2 border-slate-200" value={query} onChange={e => setQuery(e.target.value)} type="search" /></label>
 <label className="block text-sm">{t('careers.language_choose', 'Choose a language')}<select className="mt-1 w-full rounded border p-2 border-slate-200" value={preference ? value || '' : ''} onChange={e => {
        const id = e.target.value;
        if (preference) {
          onChange(id);
          return;
        }
        if (id && !selected.some(x => x.language_id === id) && selected.length < 5) onChange([...selected, {
          language_id: id,
          oral: '',
          written: ''
        }]);
      }} disabled={!preference && selected.length >= 5}>
 <option value="">{t('careers.language_choose', 'Choose a language')}</option>{options.filter(x => preference || !selected.some(s => s.language_id === x.id)).map(x => <option key={x.id} value={x.id}>{x.name}{x.id === PIDGIN && !preference ? ' (required)' : ''}</option>)}</select></label>
 {!preference && selected.map(row => <div key={row.language_id} className="space-y-2 rounded-lg bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><strong>{languages.find(x => x.id === row.language_id)?.name}</strong><button type="button" className="min-h-11 rounded border px-3 py-2 border-slate-200" onClick={() => onChange(selected.filter(x => x !== row))}>{t('common.remove', 'Remove')}</button></div>{['oral', 'written'].map(field => <label key={field} className="block text-sm">{t('careers.language_' + field, field === 'oral' ? 'Speaking / understanding (or signing)' : 'Reading / writing')}<select className="mt-1 w-full rounded border p-2 border-slate-200" value={row[field]} onChange={e => update(row.language_id, field, e.target.value)}><option value="">{t('careers.language_level', 'Choose your level')}</option>{(field === 'written' ? ['none', ...LEVELS] : LEVELS).map(level => <option key={level} value={level}>{t('careers.level_' + level, level === 'none' ? 'Not yet' : level === 'basic' ? 'Basic — simple words and sentences' : level === 'conversational' ? 'Conversational — everyday discussions' : 'Fluent — detailed explanations')}</option>)}</select></label>)}</div>)}
 </fieldset>;
}

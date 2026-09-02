import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import TurnstileWidget from '../common/TurnstileWidget';
import { FaArrowLeft, FaArrowRight, FaCheckCircle, FaShieldAlt } from 'react-icons/fa';

/**
 * Onboarding market-research survey wizard.
 * mode: 'partA' (gate: only Part A sections, non-skippable overlay)
 *       'full'  (the whole survey, used standalone or after the gate)
 * surveyType: 'tenant' | 'landlord'
 */
export default function SurveyWizard({
  surveyType = 'tenant',
  mode = 'partA',
  publicMode = false,
  paperMode = false,
  paperMeta = null,
  collectContacts = false,
  agentMode = false,
  prefillContact = null,
  locationInfo = null, // { state, lga } resolved from device GPS
  onComplete,
  onExit,
  showExit = false,
}) {
  const { t, i18n } = useTranslation();
  const lang = ['en', 'ha', 'yo', 'ig'].includes(i18n.language) ? i18n.language : 'en';

  const [definition, setDefinition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responseId, setResponseId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [consentFlags, setConsentFlags] = useState({});
  const [contact, setContact] = useState({
    name: prefillContact?.name || '',
    phone: '',
    email: prefillContact?.email || '',
    no_email: false,
    location: '',
    state_of_origin: '',
  });
  const [contactDone, setContactDone] = useState(!collectContacts);
  const [agentSession, setAgentSession] = useState({
    lga: '',
    location: '',
    admin_mode: 'face_to_face',
  });
  const [agentSessionDone, setAgentSessionDone] = useState(!agentMode);
  const [resumedDraft, setResumedDraft] = useState(false);
  const [situation, setSituation] = useState(null); // null | 'same' | 'changed'
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [screenedOut, setScreenedOut] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [startedAt] = useState(Date.now());

  const anonymousMode = publicMode || paperMode;
  const questionEnteredAt = useRef(Date.now());
  const RESUME_KEY = 'rentalhub_survey_resume';

  const sections = useMemo(() => {
    if (!definition) return [];
    const bySection = {};
    for (const q of definition.questions) {
      if (mode === 'partA' && q.part !== 'A') continue;
      (bySection[q.section] = bySection[q.section] || []).push(q);
    }
    return Object.keys(bySection)
      .filter((s) => definition.sections.includes(s))
      .map((s) => ({ section: s, questions: bySection[s] }));
  }, [definition, mode]);

  const currentSection = sections[sectionIndex] || null;
  const currentQuestion = currentSection?.questions[questionIndex] || null;

  const loadDefinition = useCallback(async () => {
    try {
      setLoading(true);
      const defRes = await api.get(`/survey/definition?type=${surveyType}&lang=${lang}`);
      setDefinition(defRes.data.data);

      if (paperMode) return;

      if (publicMode) {
        // Resume an anonymous draft from this device, if one exists.
        const token = localStorage.getItem(RESUME_KEY);
        if (token) {
          try {
            const resumeRes = await api.get(`/survey/resume?token=${encodeURIComponent(token)}`);
            if (resumeRes.data?.success) {
              const draft = resumeRes.data.data;
              if (draft.completed) {
                onComplete?.(draft);
                return;
              }
              setAnswers(draft.answers || {});
              setConsentFlags(draft.consent_flags || {});
              setResumedDraft(true);
            }
          } catch {
            // stale token — start fresh
            localStorage.removeItem(RESUME_KEY);
          }
        }
        return;
      }

      // Authenticated: claim an anonymous draft if we have a resume token.
      const localToken = localStorage.getItem(RESUME_KEY);
      if (localToken) {
        try {
          const claimRes = await api.post('/survey/claim', { resume_token: localToken });
          if (claimRes.data?.success) {
            const claimed = claimRes.data.data;
            setResponseId(claimed.response_id);
            setAnswers(claimed.answers || {});
            setConsentFlags(claimed.consent_flags || {});
            if (claimed.completed) {
              onComplete?.({ partA: true, claimed: true });
              return;
            }
            setResumedDraft(true);
            localStorage.removeItem(RESUME_KEY);
            return;
          }
        } catch {
          localStorage.removeItem(RESUME_KEY);
        }
      }

      const startRes = await api.post('/survey/start');
      const row = startRes.data.data.response;
      setResponseId(row.id);
      const saved = row.answers || {};
      if (row.completed_at) {
        onComplete?.({ partA: Boolean(row.part_a_completed_at), already_completed: true });
        return;
      }
      if (Object.keys(saved).length > 0) {
        setAnswers(saved);
        setConsentFlags(row.consent_flags || {});
        setResumedDraft(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the survey');
    } finally {
      setLoading(false);
    }
  }, [surveyType, lang, publicMode, paperMode, onComplete]);

  useEffect(() => {
    loadDefinition();
  }, [loadDefinition]);

  const autosave = useCallback(async () => {
    if (anonymousMode || !responseId || Object.keys(answers).length === 0) return;
    setSaving(true);
    try {
      await api.post('/survey/save', { response_id: responseId, answers, consent_flags: consentFlags });
    } catch {
      // silent autosave — the server keeps previous answers
    } finally {
      setSaving(false);
    }
  }, [responseId, answers, consentFlags, anonymousMode]);

  // Debounced autosave as the user answers
  useEffect(() => {
    if (publicMode === false || paperMode) return;
    if (Object.keys(answers).length === 0) return;
    const timer = setTimeout(async () => {
      try {
        const token = localStorage.getItem(RESUME_KEY) || '';
        const res = await api.post('/survey/public/draft', {
          survey_type: surveyType,
          answers,
          consent_flags: consentFlags,
          resume_token: token,
          agent: agentMode ? { ...agentSession } : undefined,
          state_name: locationInfo?.state || '',
          lga_name: locationInfo?.lga || '',
        });
        const returnedToken = res.data?.data?.resume_token;
        if (returnedToken && returnedToken !== token) {
          localStorage.setItem(RESUME_KEY, returnedToken);
        }
      } catch {
        // silent draft save
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [answers, consentFlags, surveyType, agentMode, agentSession, publicMode, paperMode, locationInfo]);

  const setAnswer = (value) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.key]: value }));
    if (currentQuestion.analysis === 'consent' && currentQuestion.endsOn && value === currentQuestion.endsOn) {
      setScreenedOut(true);
    }
  };

  const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);
  const answeredCount = sections.reduce(
    (n, s) => n + s.questions.filter((q) => {
      const v = answers[q.key];
      return v !== undefined && v !== null && v !== '';
    }).length,
    0
  );
  const progress = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const canGoNext = (() => {
    if (!currentQuestion) return false;
    const elapsed = Date.now() - questionEnteredAt.current;
    if (elapsed < (currentQuestion.minSeconds || 3) * 1000) return false;
    const v = answers[currentQuestion.key];
    if (!currentQuestion.required) return true;
    if (v === undefined || v === null || v === '') return false;
    if (currentQuestion.type === 'multi' && currentQuestion.maxPicks && Array.isArray(v) && v.length > currentQuestion.maxPicks) return false;
    return true;
  })();

  const isLastQuestion =
    sectionIndex === sections.length - 1 && questionIndex === currentSection?.questions.length - 1;

  const handleNext = async () => {
    if (!canGoNext) return;
    if (screenedOut || isLastQuestion) {
      setSubmitting(true);
      try {
        if (paperMode) {
          const res = await api.post('/admin/survey/paper-entry', {
            survey_type: surveyType,
            answers,
            consent_flags: consentFlags,
            ...(paperMeta || {}),
            contact,
            mark_complete: true,
          });
          onComplete?.(res.data.data);
          return;
        }

        if (publicMode) {
          if (!turnstileToken) {
            setError(t('survey.security_required', 'Please complete the security check to submit.'));
            setSubmitting(false);
            return;
          }
          const res = await api.post(
            '/survey/public/submit',
            {
              survey_type: surveyType,
              answers,
              consent_flags: consentFlags,
              contact,
              agent: agentMode ? { ...agentSession } : undefined,
              resume_token: localStorage.getItem(RESUME_KEY) || '',
              time_spent_seconds: Math.round((Date.now() - startedAt) / 1000),
              turnstile_token: turnstileToken,
              state_name: locationInfo?.state || '',
              lga_name: locationInfo?.lga || '',
            }
          );
          localStorage.removeItem(RESUME_KEY);
          onComplete?.(res.data.data);
          return;
        }

        await autosave();
        if (screenedOut || mode === 'partA') {
          await api.post('/survey/complete-part-a', { response_id: responseId });
          if (mode === 'partA') {
            onComplete?.({ partA: true, screenedOut });
            return;
          }
        }
        await api.post('/survey/complete', {
          response_id: responseId,
          time_spent_seconds: Math.round((Date.now() - startedAt) / 1000),
        });
        onComplete?.({ partA: false, screenedOut });
      } catch (err) {
        setError(err.response?.data?.message || 'Could not submit the survey');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (questionIndex < currentSection.questions.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else {
      setSectionIndex((s) => s + 1);
      setQuestionIndex(0);
    }
    questionEnteredAt.current = Date.now();
  };

  const handleBack = () => {
    if (questionIndex > 0) {
      setQuestionIndex((i) => i - 1);
    } else if (sectionIndex > 0) {
      setSectionIndex((s) => s - 1);
      setQuestionIndex((sections[sectionIndex - 1]?.questions.length || 1) - 1);
    }
    questionEnteredAt.current = Date.now();
  };

  const handleRestart = async () => {
    try {
      setSubmitting(true);
      await api.post('/survey/restart', { response_id: responseId });
      setAnswers({});
      setConsentFlags({});
      setResumedDraft(false);
      setSituation(null);
      setSectionIndex(0);
      setQuestionIndex(0);
      const startRes = await api.post('/survey/start');
      setResponseId(startRes.data.data.response.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not restart the survey');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSituationCheck = () => (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <h3 className="font-semibold text-amber-900">
        {t('survey.situation_title', 'Welcome back! Before you continue...')}
      </h3>
      <p className="mt-1 text-sm text-amber-800">
        {t('survey.situation_desc', 'You started this survey earlier. Your answers are saved — please confirm nothing important changed.')}
      </p>
      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium text-gray-800">
          {t('survey.situation_rent', 'Is your rent situation the same as when you started this survey?')}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSituation('same')}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {t('survey.situation_same', 'Yes, same')}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            disabled={submitting}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {t('survey.situation_changed', "No, it changed — start fresh")}
          </button>
        </div>
        <p className="mt-3 text-sm font-medium text-gray-800">
          {t('survey.situation_location', 'Have you moved to a different state or LGA since you started?')}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSituation('same')}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {t('survey.situation_no', 'No, same place')}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            disabled={submitting}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {t('survey.situation_moved', 'Yes, I moved — start fresh')}
          </button>
        </div>
        <p className="mt-2 text-xs text-amber-700">
          {t('survey.situation_note', 'If you start fresh, your old answers are permanently discarded and never used in analysis.')}
        </p>
      </div>
    </div>
  );

  const renderAgentStep = () => {
    const canContinue = agentSession.lga.trim().length >= 2;
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {t('survey.agent_intro', 'You are conducting this survey as a RentalHub marketing agent. Your name and phone are recorded from your account — just tell us where this interview is happening.')}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">
            {t('survey.agent_lga', 'LGA where the survey is carried out *')}
          </span>
          <input
            type="text"
            value={agentSession.lga}
            onChange={(e) => setAgentSession((a) => ({ ...a, lga: e.target.value }))}
            placeholder="e.g. Gwagwalada"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('survey.agent_location', 'Location / area')}</span>
          <input
            type="text"
            value={agentSession.location}
            onChange={(e) => setAgentSession((a) => ({ ...a, location: e.target.value }))}
            placeholder={t('survey.agent_location_ph', 'e.g. Phase 1, Gwagwalada Surveyarea')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('survey.agent_mode_label', 'How is this survey being administered?')}</span>
          <select
            value={agentSession.admin_mode}
            onChange={(e) => setAgentSession((a) => ({ ...a, admin_mode: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="face_to_face">{t('survey.mode_face', 'Face-to-face')}</option>
            <option value="telephone">{t('survey.mode_phone', 'Telephone')}</option>
            <option value="online">{t('survey.mode_online', 'Online self-completion')}</option>
            <option value="other">{t('survey.mode_other', 'Other')}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            if (!canContinue) {
              setError(t('survey.agent_lga_required', 'Please enter the LGA where the survey is carried out.'));
              return;
            }
            setError('');
            setAgentSessionDone(true);
            questionEnteredAt.current = Date.now();
          }}
          disabled={!canContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t('survey.agent_continue', 'Continue to the respondent')}
          <FaArrowRight />
        </button>
      </div>
    );
  };

  const renderContactStep = () => {
    const canSubmitContact =
      contact.name.trim().length >= 2 &&
      contact.phone.replace(/\D/g, '').length >= 10 &&
      contact.location.trim().length >= 2 &&
      contact.state_of_origin.trim().length >= 2;

    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          {t('survey.contact_intro', 'Tell us how to reach you (optional for the survey itself, but very helpful). We only use these details to contact you about RentalHub NG — never for anything else.')}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('survey.contact_name', 'Full name *')}</span>
          <input
            type="text"
            value={contact.name}
            onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('survey.contact_phone', 'Phone number *')}</span>
          <input
            type="tel"
            value={contact.phone}
            onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
            placeholder="0803 000 0000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">
            {t('survey.contact_location', 'Where do you currently live? (state, city) *')}
          </span>
          <input
            type="text"
            value={contact.location}
            onChange={(e) => setContact((c) => ({ ...c, location: e.target.value }))}
            placeholder={t('survey.contact_location_ph', 'e.g. Gwagwalada, FCT Abuja')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">{t('survey.contact_state_origin', 'State of origin *')}</span>
          <input
            type="text"
            value={contact.state_of_origin}
            onChange={(e) => setContact((c) => ({ ...c, state_of_origin: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {contact.no_email ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t('survey.contact_no_email_note', 'No email recorded for this respondent.')}
            <button
              type="button"
              onClick={() => setContact((c) => ({ ...c, no_email: false }))}
              className="ml-2 font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {t('survey.contact_add_email', 'Add email instead')}
            </button>
          </p>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">{t('survey.contact_email', 'Email address (optional)')}</span>
            <input
              type="email"
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        )}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="survey-no-email"
            checked={contact.no_email}
            onChange={(e) => setContact((c) => ({ ...c, no_email: e.target.checked, email: '' }))}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <label htmlFor="survey-no-email" className="text-sm text-gray-700">
            {agentMode
              ? t('survey.contact_no_email_agent', 'This respondent has no email address')
              : t('survey.contact_no_email_public', 'I do not have an email address')}
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!canSubmitContact) {
              setError(t('survey.contact_required', 'Please fill in your name, phone, current location and state of origin.'));
              return;
            }
            setError('');
            setContactDone(true);
            questionEnteredAt.current = Date.now();
          }}
          disabled={!canSubmitContact}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {t('survey.contact_continue', 'Continue to the survey')}
          <FaArrowRight />
        </button>
      </div>
    );
  };

  const renderQuestion = () => {
    if (!currentQuestion) return null;
    const q = currentQuestion;
    const value = answers[q.key];
    const labels = q.labels || {};

    if (q.type === 'likert') {
      return (
        <div className="mt-6 grid grid-cols-5 gap-2">
          {(q.options || ['1', '2', '3', '4', '5'].map((x) => [x, x])).map((opt) => {
            const v = typeof opt === 'string' ? opt : opt.v;
            const label = typeof opt === 'string' ? labels[opt] || opt : opt.label;
            const selected = Number(value) === Number(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => setAnswer(Number(v))}
                className={`rounded-xl border-2 p-3 text-center transition ${
                  selected
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-indigo-300'
                }`}
              >
                <span className="block text-xl font-bold text-gray-900">{v}</span>
                <span className="mt-1 block text-[11px] leading-tight text-gray-500">{label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (q.type === 'single' || q.type === 'consent') {
      return (
        <div className="mt-6 space-y-2">
          {q.options.map((opt) => {
            const selected = value === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setAnswer(opt.v)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                  selected
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-indigo-300'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                  }`}
                >
                  {selected && <FaCheckCircle className="h-3 w-3 text-white" />}
                </span>
                <span className="text-sm text-gray-800">{opt.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (q.type === 'multi' || q.type === 'rank') {
      const picks = Array.isArray(value) ? value : [];
      const maxPicks = q.maxPicks || q.options.length;
      return (
        <div className="mt-6 space-y-2">
          {q.options.map((opt) => {
            const selected = picks.includes(opt.v);
            const atLimit = !selected && picks.length >= maxPicks;
            return (
              <button
                key={opt.v}
                type="button"
                disabled={atLimit}
                onClick={() => {
                  const next = selected
                    ? picks.filter((p) => p !== opt.v)
                    : [...picks, opt.v];
                  setAnswer(next);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition disabled:opacity-40 ${
                  selected
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-indigo-300'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                    selected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                  }`}
                >
                  {selected && <FaCheckCircle className="h-3 w-3 text-white" />}
                </span>
                <span className="text-sm text-gray-800">{opt.label}</span>
              </button>
            );
          })}
          {q.maxPicks && (
            <p className="text-xs text-gray-500">
              {t('survey.pick_limit', 'Choose up to {{count}}: {{picked}} chosen', {
                count: q.maxPicks,
                picked: picks.length,
              })}
            </p>
          )}
        </div>
      );
    }

    // text
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => setAnswer(e.target.value)}
        rows={4}
        className="mt-6 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        placeholder={t('survey.text_placeholder', 'Write your answer here...')}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-6 text-center text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!currentQuestion) return null;

  const exitLabel = mode === 'partA'
    ? t('survey.part_a_title', 'A few quick questions before you continue')
    : t('survey.title', 'RentalHub NG Research Survey');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{exitLabel}</h2>
          <p className="text-xs text-gray-500">
            {agentMode && !agentSessionDone
              ? t('survey.agent_step', 'Step 1 of 3 — your interview details')
              : collectContacts && !contactDone
                ? t('survey.contact_step', 'Step 1 of 2 — your contact details')
                : mode === 'partA'
                  ? t('survey.part_a_sub', 'This first section takes about 2 minutes. The rest can be finished later.')
                  : t('survey.part_b_sub', 'Section {{section}} · Question {{q}} of {{total}}', {
                      section: currentSection?.section,
                      q: questionIndex + 1,
                      total: currentSection?.questions.length,
                    })}
          </p>
        </div>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
          {agentMode && !agentSessionDone ? 0 : collectContacts && !contactDone ? 0 : progress}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-indigo-600 transition-all duration-300"
          style={{ width: `${agentMode && !agentSessionDone ? 0 : collectContacts && !contactDone ? 0 : progress}%` }}
        />
      </div>

      {agentMode && !agentSessionDone ? (
        renderAgentStep()
      ) : collectContacts && !contactDone ? (
        renderContactStep()
      ) : resumedDraft && situation === null && !publicMode && !paperMode ? (
        <>
          {renderSituationCheck()}
          <button
            type="button"
            onClick={() => setSituation('same')}
            className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t('survey.continue_existing', 'Continue with my saved answers')}
          </button>
        </>
      ) : (
        <>
          {/* Section label */}
          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">
              {t('survey.section', 'Section')} {currentSection?.section}
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-snug text-gray-900">
              {currentQuestion.prompt}
            </h3>
          </div>

          {renderQuestion()}

          {screenedOut && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t('survey.screened_out', 'Thank you for your time — this survey does not apply to you. Your answer has been recorded.')}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              disabled={sectionIndex === 0 && questionIndex === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <FaArrowLeft /> {t('survey.back', 'Back')}
            </button>
            <div className="flex flex-col items-end gap-2">
              {publicMode && (isLastQuestion || screenedOut) && (
                <TurnstileWidget
                  action="rentalhub_survey"
                  onToken={setTurnstileToken}
                />
              )}
              <div className="flex items-center gap-2">
                {saving && <span className="text-xs text-gray-400">{t('survey.saving', 'Saving...')}</span>}
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext || submitting || (publicMode && (isLastQuestion || screenedOut) && !turnstileToken)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting
                    ? t('survey.submitting', 'Submitting...')
                    : isLastQuestion || screenedOut
                      ? t('survey.finish', 'Finish')
                      : t('survey.next', 'Next')}
                  <FaArrowRight />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showExit && !screenedOut && mode !== 'partA' && (
        <button
          type="button"
          onClick={onExit}
          className="mt-4 block w-full text-center text-sm font-medium text-gray-400 hover:text-gray-600"
        >
          {t('survey.finish_later', 'Finish later from my dashboard')}
        </button>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-400">
        <FaShieldAlt className="text-gray-400" />
        {t('survey.privacy_note', 'Anonymous Surveyresearch. Your personal details are never linked to your answers.')}
      </p>
    </div>
  );
}

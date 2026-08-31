import React, { useCallback, useEffect, useState } from "react";
import { FaChartPie, FaFilePdf, FaFileCsv, FaPlus, FaTrash, FaBell } from "react-icons/fa";
import { toast } from "react-toastify";
import api from "../../services/api";
import SurveyWizard from "../survey/SurveyWizard";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const SurveyAdminPanel = () => {
  const [tab, setTab] = useState("overview");
  const [type, setType] = useState("tenant");
  const [analysis, setAnalysis] = useState(null);
  const [projections, setProjections] = useState(null);
  const [responses, setResponses] = useState(null);
  const [loading, setLoading] = useState(false);
  const [projUsers, setProjUsers] = useState(10000);
  const [projAvg, setProjAvg] = useState(500000);
  const [projBudget, setProjBudget] = useState(5000000);
  const [paperOpen, setPaperOpen] = useState(false);
  const [locConfig, setLocConfig] = useState(null);
  const [locScope, setLocScope] = useState("nigeria");
  const [locList, setLocList] = useState([]);
  const [locSaving, setLocSaving] = useState(false);
  const [paperMeta, setPaperMeta] = useState({
    admin_mode: "face_to_face",
    admin_date: new Date().toISOString().slice(0, 10),
    state_name: "",
    lga_name: "",
  });

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/survey/analysis?type=${type}`);
      setAnalysis(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }, [type]);

  const loadResponses = useCallback(async () => {
    try {
      const res = await api.get(`/admin/survey/responses?type=${type}&limit=50`);
      setResponses(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load responses");
    }
  }, [type]);

  const loadProjections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(
        `/admin/survey/projections?type=${type}&users=${projUsers}&avg_transaction=${projAvg}&budget=${projBudget}`
      );
      setProjections(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to run projections");
    } finally {
      setLoading(false);
    }
  }, [type, projUsers, projAvg, projBudget]);

  const loadLocationConfig = useCallback(async () => {
    try {
      const res = await api.get("/admin/survey/location-config");
      setLocConfig(res.data.data);
      setLocScope(res.data.data.scope || "nigeria");
      setLocList(res.data.data.locations || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (tab === "responses") loadResponses();
    if (tab === "projections") loadProjections();
    loadLocationConfig();
  }, [tab, type, loadAnalysis, loadResponses, loadProjections, loadLocationConfig]);

  const saveLocationConfig = async () => {
    setLocSaving(true);
    try {
      const res = await api.post("/admin/survey/location-config", {
        scope: locScope,
        locations: locList,
      });
      toast.success(res.data?.message || "Location rules saved");
      setLocConfig(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save location rules");
    } finally {
      setLocSaving(false);
    }
  };

  const exportPdf = () => {
    window.open(`/api/admin/survey/export.pdf?type=${type}`, "_blank");
  };
  const exportCsv = () => {
    window.open(`/api/admin/survey/export.csv?type=${type}`, "_blank");
  };

  const sendPushReminders = async () => {
    if (!window.confirm("Send a push reminder to everyone with an unfinished survey?")) return;
    try {
      const res = await api.post("/admin/survey/reminders/send");
      toast.success(res.data?.message || "Push reminders sent");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send push reminders");
    }
  };

  const deleteResponse = async (id) => {
    if (!window.confirm("Delete this survey response?")) return;
    try {
      await api.delete(`/admin/survey/responses/${id}`);
      toast.success("Response deleted");
      loadResponses();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete response");
    }
  };

  const frequencyFor = (key) =>
    analysis?.frequencies?.find((f) => f.key === key);

  const pain = (analysis?.frequencies || [])
    .filter((f) => f.analysis === "pain" && f.mean !== null)
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 12);

  const nps = analysis?.nps;
  const meta = analysis?.meta || {};

  const tabs = [
    ["overview", "Overview"],
    ["analysis", "Full Analysis"],
    ["projections", "Projections"],
    ["responses", "Responses & Paper Entry"],
    ["location", "Location Rules"],
  ];

  return (
    <div className="bg-white border border-soft rounded-xl2 shadow-card p-6 animate-fadeIn">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FaChartPie className="text-indigo-600" /> Survey & Analysis
          </h3>
          <p className="text-sm text-gray-500">
            Onboarding market research: tenant & landlord questionnaires, analysis and projections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-soft px-3 py-2 text-sm"
          >
            <option value="tenant">Tenants</option>
            <option value="landlord">Landlords</option>
          </select>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            <FaFilePdf /> PDF
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            <FaFileCsv /> CSV
          </button>
          <button
            type="button"
            onClick={sendPushReminders}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <FaBell /> Push Reminders
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && tab !== "responses" && (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      )}

      {/* ── Overview ─────────────────────────────────────────────────── */}
      {tab === "overview" && analysis && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-soft bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-500">Responses</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{meta.total}</p>
            </div>
            <div className="rounded-xl border border-soft bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-500">Completed</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{meta.completed}</p>
            </div>
            <div className="rounded-xl border border-soft bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-500">Avg time</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {Math.round((meta.avg_time_seconds || 0) / 60)} min
              </p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase text-indigo-600">NPS</p>
              <p className="mt-1 text-2xl font-bold text-indigo-800">
                {nps?.score === null || nps?.score === undefined ? "n/a" : nps.score}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-soft p-4">
              <p className="mb-3 text-sm font-semibold text-gray-700">Responses by State</p>
              {meta.by_state?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={meta.by_state}>
                    <XAxis dataKey="state" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-10 text-center text-sm text-gray-400">No responses yet</p>
              )}
            </div>
            <div className="rounded-xl border border-soft p-4">
              <p className="mb-3 text-sm font-semibold text-gray-700">Source</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={Object.entries(meta.by_source || {}).map(([k, v]) => ({ name: k, value: v }))}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={80}
                    label={(e) => `${e.name}: ${e.value}`}
                  >
                    {Object.entries(meta.by_source || {}).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-soft p-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">Top Pain Points (1–5 means)</p>
            {pain.length ? (
              <div className="space-y-2">
                {pain.slice(0, 8).map((p, i) => (
                  <div key={p.key} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-xs font-bold text-indigo-700">[{p.mean}]</span>
                    <div className="min-w-0 flex-1">
                      <div className="h-3 w-full overflow-hidden rounded bg-gray-100">
                        <div
                          className="h-full rounded bg-indigo-500"
                          style={{ width: `${(p.mean / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-40 shrink-0 truncate text-right text-xs text-gray-600" title={p.prompt}>
                      {p.key} · {p.prompt}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">Not enough data yet</p>
            )}
          </div>
        </div>
      )}

      {/* ── Full analysis ────────────────────────────────────────────── */}
      {tab === "analysis" && analysis && !loading && (
        <div className="space-y-6">
          <div className="rounded-xl border border-soft p-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">NPS & Adoption Signals</p>
            {nps && nps.score !== null && (
              <p className="text-sm text-gray-700">
                NPS: <strong>{nps.score}</strong> ({nps.promoters} promoters · {nps.passives} passives ·{" "}
                {nps.detractors} detractors of {nps.total})
              </p>
            )}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["Scammed (personal)", frequencyFor(type === "landlord" ? "L3.2" : "T4.1")],
                ["Paid without receipt", frequencyFor("T3.8")],
                ["Asked >1yr rent upfront", frequencyFor("T3.3")],
              ].map(([label, freq]) => {
                if (!freq) return null;
                const yes = freq.counts["yes"] || 0;
                const pct = freq.answered ? Math.round((yes / freq.answered) * 100) : 0;
                return (
                  <div key={label} className="rounded-xl border border-soft bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="mt-1 text-lg font-bold text-gray-900">
                      {pct}% <span className="text-xs font-normal text-gray-500">({yes} of {freq.answered})</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-soft p-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">Feature Priority</p>
            <p className="mb-2 text-xs text-gray-500">Importance ratings (1–5)</p>
            <div className="space-y-1.5">
              {analysis.feature.importance.slice(0, 13).map((f, i) => (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs font-bold text-indigo-700">[{f.mean || "n/a"}]</span>
                  <div className="min-w-0 flex-1 truncate text-sm text-gray-700" title={f.prompt}>
                    {i + 1}. {f.prompt}
                  </div>
                </div>
              ))}
            </div>
            {analysis.feature.picks.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-xs text-gray-500">Most-picked in top-3 choices</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.feature.picks.slice(0, 8).map((p) => (
                    <span key={p.key} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                      {p.label} · {p.count}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-soft p-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">All Question Frequencies</p>
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {analysis.frequencies.map((f) => (
                <details key={f.key} className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium text-gray-800">
                    {f.key} — {f.prompt} <span className="text-xs text-gray-400">({f.answered} answered{f.mean !== null ? ` · mean ${f.mean}` : ""})</span>
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(f.counts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([v, count]) => (
                        <span key={v} className="rounded-full bg-white border border-gray-200 px-2.5 py-1 text-xs text-gray-700">
                          {f.labels?.[v] || v}: <strong>{count}</strong>
                        </span>
                      ))}
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-soft p-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">Open-Ended Answers</p>
            <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
              {analysis.open_answers.filter((s) => s.answerCount).map((s) => (
                <div key={s.key} className="rounded-lg border border-gray-100 p-3">
                  <p className="text-sm font-semibold text-gray-800">{s.key} — {s.prompt}</p>
                  {s.keywords.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      Themes: {s.keywords.slice(0, 8).map((k) => `${k.word} (${k.count})`).join(", ")}
                    </p>
                  )}
                  <ul className="mt-2 space-y-1">
                    {s.answers.slice(0, 8).map((a, i) => (
                      <li key={i} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">
                        <span className="font-mono text-gray-400">{a.respondent} · {a.state || "—"}: </span>
                        {a.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Projections ──────────────────────────────────────────────── */}
      {tab === "projections" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-soft bg-gray-50 p-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Expected users / year</span>
              <input
                type="number"
                min="0"
                value={projUsers}
                onChange={(e) => setProjUsers(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Average transaction (₦)</span>
              <input
                type="number"
                min="0"
                value={projAvg}
                onChange={(e) => setProjAvg(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Funding budget (₦)</span>
              <input
                type="number"
                min="0"
                value={projBudget}
                onChange={(e) => setProjBudget(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={loadProjections}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 sm:col-span-3"
            >
              Run Projections
            </button>
          </div>

          {projections && !loading && (
            <>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <p className="text-sm text-indigo-900">
                  Survey willingness to pay: <strong>{projections.will_pay_pct}%</strong> of respondents
                  would accept a platform fee. Recommended one-off fee from the survey:{" "}
                  <strong>{projections.suggested_fee_label}</strong>.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {projections.scenarios.map((s) => (
                  <div key={s.scenario} className="rounded-xl border border-soft p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-700">{s.scenario} scenario</p>
                    <p className="mt-1 text-xs text-gray-500">Adoption {Math.round(s.adoption * 100)}% · {s.active_users.toLocaleString()} active users</p>
                    <div className="mt-3 space-y-1 text-sm text-gray-700">
                      <p>Revenue: <strong className="text-green-700">₦{s.revenue.toLocaleString()}</strong></p>
                      <p>Total cost: <strong className="text-red-700">₦{s.total_cost.toLocaleString()}</strong></p>
                      <p>Profit: <strong className={s.profit >= 0 ? "text-green-700" : "text-red-700"}>₦{s.profit.toLocaleString()}</strong></p>
                      <p>Support staff: {s.support_fte} FTE</p>
                    </div>
                    <div className="mt-3 rounded-lg bg-gray-50 p-2">
                      <p className="text-xs font-semibold text-gray-600">Department needing most money</p>
                      <p className="text-sm font-bold text-gray-900">
                        {s.top_department.label} — {s.top_department.share_pct}%
                      </p>
                      <p className="text-xs text-gray-500">₦{s.top_department.annual.toLocaleString()} / year</p>
                    </div>
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      <p className="font-semibold">Funding recommendation</p>
                      <p>{s.funding.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Responses & paper entry ──────────────────────────────────── */}
      {tab === "responses" && (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => setPaperOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <FaPlus /> Paper Survey Entry
          </button>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Code</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Respondent</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Phone</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Lives in</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">State of origin</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Agent</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Agent LGA</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Source</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {(responses?.responses || []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.respondent_code}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <p className="font-medium">{r.respondent_name || r.user_full_name || "—"}</p>
                      <p className="text-xs text-gray-400">{r.lga_name || r.state_name || ""}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.respondent_phone || "—"}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {r.has_email ? (r.respondent_email || "—") : <span className="text-xs font-semibold text-gray-400">NO EMAIL</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.respondent_location || "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{r.respondent_state_of_origin || "—"}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.agent_name ? (
                        <span>
                          {r.agent_name}
                          {r.agent_phone ? <span className="block text-xs text-gray-400">{r.agent_phone}</span> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.agent_lga || "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{r.source}{r.admin_mode ? ` (${r.admin_mode})` : ""}</td>
                    <td className="px-3 py-2">
                      {r.completed_at ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Completed</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Partial</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => deleteResponse(r.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
                {!responses?.responses?.length && (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-sm text-gray-400">
                      No responses yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {paperOpen && (
            <div className="fixed inset-0 z-[110] overflow-y-auto bg-white">
              <div className="mx-auto max-w-2xl px-4 py-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Paper Survey Entry</h3>
                  <button
                    type="button"
                    onClick={() => setPaperOpen(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-soft bg-gray-50 p-4 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Survey type</span>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="tenant">Tenant</option>
                      <option value="landlord">Landlord</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Mode of administration (R3)</span>
                    <select
                      value={paperMeta.admin_mode}
                      onChange={(e) => setPaperMeta((p) => ({ ...p, admin_mode: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="face_to_face">Face-to-face</option>
                      <option value="telephone">Telephone</option>
                      <option value="online">Online self-completion</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Date (R2)</span>
                    <input
                      type="date"
                      value={paperMeta.admin_date}
                      onChange={(e) => setPaperMeta((p) => ({ ...p, admin_date: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-gray-700">State (R2)</span>
                    <input
                      type="text"
                      value={paperMeta.state_name}
                      onChange={(e) => setPaperMeta((p) => ({ ...p, state_name: e.target.value }))}
                      placeholder="e.g. Lagos"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block font-medium text-gray-700">LGA / City (R2)</span>
                    <input
                      type="text"
                      value={paperMeta.lga_name}
                      onChange={(e) => setPaperMeta((p) => ({ ...p, lga_name: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Fill in the questionnaire below exactly as answered on the paper form. Answers are saved when you
                  finish. The respondent code is generated automatically.
                </div>
                <SurveyWizard
                  surveyType={type}
                  mode="full"
                  paperMode
                  paperMeta={paperMeta}
                  collectContacts
                  onComplete={() => {
                    setPaperOpen(false);
                    toast.success("Paper response recorded");
                    loadResponses();
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {/* ── Location rules ──────────────────────────────────────────────── */}
      {tab === "location" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-soft bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-700">Survey Location & VPN Gate</p>
            <p className="mt-1 text-xs text-gray-500">
              Gate status:{" "}
              <span className={`font-semibold ${locConfig?.gate_enabled ? "text-green-600" : "text-amber-600"}`}>
                {locConfig?.gate_enabled ? "ENABLED" : "DISABLED"}
              </span>{" "}
              — toggle it from Super Admin → Flags (the "Survey Location Gate" flag). When enabled,
              respondents must be physically in the allowed area (real-time device location) and VPN/proxy
              connections are blocked.
            </p>
          </div>

          <div className="rounded-xl border border-soft p-4">
            <p className="mb-2 text-sm font-semibold text-gray-700">Allowed scope</p>
            <select
              value={locScope}
              onChange={(e) => setLocScope(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="nigeria">Anywhere in Nigeria</option>
              <option value="locations">Only the listed locations below</option>
            </select>
          </div>

          {locScope === "locations" && (
            <div className="rounded-xl border border-soft p-4">
              <p className="mb-2 text-sm font-semibold text-gray-700">Allowed locations</p>
              {locList.map((loc, i) => (
                <div key={i} className="mb-2 grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 sm:grid-cols-4">
                  <input
                    value={loc.label || ""}
                    onChange={(e) => {
                      const next = [...locList];
                      next[i] = { ...next[i], label: e.target.value };
                      setLocList(next);
                    }}
                    placeholder="Label (e.g. FCT Gwagwalada)"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <input
                    type="number"
                    step="any"
                    value={loc.lat}
                    onChange={(e) => {
                      const next = [...locList];
                      next[i] = { ...next[i], lat: Number(e.target.value) };
                      setLocList(next);
                    }}
                    placeholder="Latitude"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="any"
                    value={loc.lng}
                    onChange={(e) => {
                      const next = [...locList];
                      next[i] = { ...next[i], lng: Number(e.target.value) };
                      setLocList(next);
                    }}
                    placeholder="Longitude"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={loc.radius_km}
                    onChange={(e) => {
                      const next = [...locList];
                      next[i] = { ...next[i], radius_km: Number(e.target.value) };
                      setLocList(next);
                    }}
                    placeholder="Radius km"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setLocList(locList.filter((_, j) => j !== i))}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLocList([...locList, { label: "", lat: 0, lng: 0, radius_km: 30 }])}
                className="mt-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                + Add location
              </button>
              <p className="mt-2 text-xs text-gray-400">
                Tip: find any place's latitude/longitude on Google Maps (right-click the spot).
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={locSaving}
            onClick={saveLocationConfig}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {locSaving ? "Saving…" : "Save Location Rules"}
          </button>
        </div>
      )}
    </div>
  );
};

export default SurveyAdminPanel;

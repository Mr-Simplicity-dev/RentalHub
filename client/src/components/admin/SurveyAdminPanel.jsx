import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  const [locScope, setLocScope] = useState("lga_list");
  const [locList, setLocList] = useState([]);
  const [locSaving, setLocSaving] = useState(false);
  const [locOptions, setLocOptions] = useState([]);
  const [locNewState, setLocNewState] = useState("");
  const [locNewLga, setLocNewLga] = useState("");
  const [fxConfig, setFxConfig] = useState({ black_market_usd_rate: 1600, foreign_card_conversion_fee_usd: 5 });
  const [fxSaving, setFxSaving] = useState(false);

  const PAGE_SIZE = 25;
  const [locPage, setLocPage] = useState(1);
  const [locQuery, setLocQuery] = useState("");

  const allLocations = useMemo(() => {
    const flat = [];
    for (const s of locOptions) {
      const st = String(s.state_name || "").trim();
      for (const lga of Array.isArray(s.lgas) ? s.lgas : []) {
        flat.push({ state_name: st, lga_name: String(lga).trim() });
      }
    }
    return flat;
  }, [locOptions]);

  const filteredAll = useMemo(() => {
    const q = String(locQuery || "").toLowerCase().trim();
    if (!q) return [];
    return allLocations
      .filter(
        (l) =>
          (l.state_name + " " + l.lga_name).toLowerCase().includes(q) ||
          l.lga_name.toLowerCase().includes(q) ||
          l.state_name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allLocations, locQuery]);

  const isAllEnabled =
    Array.isArray(locConfig?.locations) &&
    locConfig.locations.length === allLocations.length &&
    allLocations.length > 0;

  const totalPages = Math.max(1, Math.ceil(locList.length / PAGE_SIZE));
  const pagedLocations = locList.slice((locPage - 1) * PAGE_SIZE, locPage * PAGE_SIZE);
  useEffect(() => {
    if (locPage > totalPages) setLocPage(totalPages);
  }, [locPage, totalPages]);
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
      const [configRes, optionsRes] = await Promise.all([
        api.get("/admin/survey/location-config"),
        api.get("/property-utils/location-options"),
      ]);
      setLocConfig(configRes.data.data);
      setLocScope(configRes.data.data.scope || "lga_list");
      setLocList(configRes.data.data.locations || []);
      setLocOptions(optionsRes.data.data || []);
    } catch {
      // ignore
    }
  }, []);

  const addLocationRule = () => {
    if (!locNewState || !locNewLga) {
      toast.error("Select a state and an LGA first");
      return;
    }
    const stateName = locOptions.find((s) => String(s.id) === String(locNewState))?.state_name || locNewState;
    if (locList.some((l) => l.lga_name === locNewLga && l.state_name === stateName)) {
      toast.error("That state/LGA is already enabled");
      return;
    }
    setLocList([...locList, { state_name: stateName, lga_name: locNewLga }]);
    setLocNewLga("");
  };

  const loadFxConfig = useCallback(async () => {
    try {
      const res = await api.get("/admin/survey/fx-config");
      setFxConfig(res.data.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (tab === "responses") loadResponses();
    if (tab === "projections") loadProjections();
    loadLocationConfig();
    loadFxConfig();
  }, [tab, type, loadAnalysis, loadResponses, loadProjections, loadLocationConfig, loadFxConfig]);

  const saveFxConfig = async () => {
    setFxSaving(true);
    try {
      await api.post("/admin/survey/fx-config", fxConfig);
      toast.success("FX rules saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save FX rules");
    } finally {
      setFxSaving(false);
    }
  };

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

  const [locGateBusy, setLocGateBusy] = useState(false);

  const toggleLocationGate = async () => {
    const targetEnabled = !(locConfig?.gate_enabled === true);
    const reason = window.prompt(
      targetEnabled
        ? "Open the public survey? It will be location-gated to the enabled states/LGAs below. Give a reason for the audit log:"
        : "Close the public survey to everyone (rentalhub.com.ng/survey shows 'Survey closed')? Give a reason:"
    );
    if (reason === null) return;
    if (!String(reason || "").trim()) {
      toast.error("A reason is required to change the gate");
      return;
    }
    setLocGateBusy(true);
    try {
      await api.patch("/super/flags/survey_location_gate", {
        enabled: targetEnabled,
        reason: String(reason).trim(),
      });
      toast.success(`Survey Location Gate ${targetEnabled ? "enabled" : "disabled"}`);
      await loadLocationConfig();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update the gate");
    } finally {
      setLocGateBusy(false);
    }
  };

  const enableAllLocations = async () => {
    if (!window.confirm("Enable the survey for ALL 774 Nigerian LGAs? VPN/foreign-IP blocking and the OFF=closed switch still apply.")) {
      return;
    }
    setLocSaving(true);
    try {
      const res = await api.post("/admin/survey/location-config/enable-all");
      toast.success(res.data?.message || "Enabled all LGAs");
      setLocConfig({ ...(locConfig || {}), ...res.data.data });
      setLocList(res.data.data?.locations || []);
      setLocPage(1);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to enable all LGAs");
    } finally {
      setLocSaving(false);
    }
  };

  const disableAllLocations = async () => {
    if (!window.confirm("Remove ALL enabled LGAs? While the gate is ON the survey becomes unavailable everywhere until you re-enable some.")) {
      return;
    }
    setLocSaving(true);
    try {
      const res = await api.post("/admin/survey/location-config", {
        scope: locScope,
        locations: [],
      });
      toast.success(res.data?.message || "Removed all LGAs");
      setLocList([]);
      setLocPage(1);
      setLocConfig({ ...(locConfig || {}), scope: res.data.data?.scope || "lga_list", locations: [] });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove all LGAs");
    } finally {
      setLocSaving(false);
    }
  };

  const toggleAllLocations = () => {
    if (isAllEnabled) disableAllLocations();
    else enableAllLocations();
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
    ["fx", "FX Rules"],
  ];

  return (
    <div className="bg-white border border-soft rounded-xl2 shadow-card p-6 animate-fadeIn">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FaChartPie className="text-indigo-600" /> Survey & Analysis
          </h3>
          <p className="text-sm text-gray-500">
            Onboarding Surveyresearch: tenant & landlord questionnaires, analysis and projections.
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">Public Survey Switch & Location/VPN Gate</p>
                <p className="mt-1 text-xs text-gray-500">
                  Status:{" "}
                  <span className={`font-semibold ${locConfig?.gate_enabled ? "text-green-600" : "text-red-600"}`}>
                    {locConfig?.gate_enabled ? "OPEN (location-gated)" : "CLOSED"}
                  </span>{" "}
                  — when ON, the public survey at rentalhub.com.ng/survey is open but only to respondents whose
                  device location resolves to an ENABLED state + LGA below; anyone else sees "not available in this
                  local government", and VPN/proxy connections are blocked (consensus across two IP providers).
                  When OFF, the public survey is closed and shows "Survey closed" (marketing-agent field entry is
                  still allowed).
                </p>
              </div>
              <button
                type="button"
                disabled={locGateBusy || !locConfig}
                onClick={toggleLocationGate}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  locConfig?.gate_enabled ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {locGateBusy ? "Saving…" : locConfig?.gate_enabled ? "Close Survey (Gate OFF)" : "Open Survey (Gate ON)"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-soft p-4">
            <p className="mb-2 text-sm font-semibold text-gray-700">Enabled states & LGAs</p>
            <div className="mb-3">
              <input
                type="text"
                value={locQuery}
                onChange={(e) => setLocQuery(e.target.value)}
                placeholder="Search any of the 774 LGAs to enable (e.g. Zuba, Gwagwalada, Eti-Osa)…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              {String(locQuery || "").trim().length >= 2 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {filteredAll.length === 0 ? (
                    <p className="text-xs text-gray-400">No matching LGA found.</p>
                  ) : (
                    filteredAll.map((m) => {
                      const already = locList.some(
                        (l) => l.state_name === m.state_name && l.lga_name === m.lga_name
                      );
                      return already ? null : (
                        <button
                          key={`${m.state_name}-${m.lga_name}`}
                          type="button"
                          onClick={() => {
                            setLocList([...locList, m]);
                            setLocQuery("");
                          }}
                          className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                        >
                          + {m.lga_name} ({m.state_name})
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={locNewState}
                onChange={(e) => {
                  setLocNewState(e.target.value);
                  setLocNewLga("");
                }}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select state…</option>
                {locOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.state_name}
                  </option>
                ))}
              </select>
              <select
                value={locNewLga}
                onChange={(e) => setLocNewLga(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!locNewState}
              >
                <option value="">Select LGA…</option>
                {(locOptions.find((s) => String(s.id) === String(locNewState))?.lgas || []).map((lga) => (
                  <option key={lga} value={lga}>
                    {lga}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addLocationRule}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Enable
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {locList.length === 0 && (
                <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">
                  No locations enabled yet — the survey will be unavailable everywhere while the gate is on.
                </p>
              )}
              {locList.length > 0 && (
                <p className="text-xs text-gray-400">
                  {locList.length.toLocaleString()} enabled · page {Math.min(locPage, totalPages)} of {totalPages.toLocaleString()}
                </p>
              )}
              {pagedLocations.map((loc) => (
                <div
                  key={`${loc.state_name}-${loc.lga_name}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="text-gray-700">
                    <strong>{loc.lga_name}</strong> — {loc.state_name}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLocList(
                        locList.filter(
                          (l) => !(l.state_name === loc.state_name && l.lga_name === loc.lga_name)
                        )
                      )
                    }
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  disabled={locPage <= 1}
                  onClick={() => setLocPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  ‹ Prev
                </button>
                <span className="text-xs text-gray-500">
                  {Math.min(locPage, totalPages)} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={locPage >= totalPages}
                  onClick={() => setLocPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next ›
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={locSaving}
              onClick={saveLocationConfig}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {locSaving ? "Saving…" : "Save Location Rules"}
            </button>
            <button
              type="button"
              disabled={locSaving || !locConfig}
              onClick={toggleAllLocations}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                isAllEnabled ? "bg-red-600 hover:bg-red-700" : "border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50"
              }`}
            >
              {locSaving
                ? "Saving…"
                : isAllEnabled
                  ? "Disable all 774 LGAs (clear)"
                  : "Enable all 774 LGAs (whole Nigeria)"}
            </button>
          </div>
        </div>
      )}
      {/* ── FX rules ─────────────────────────────────────────────────────── */}
      {tab === "fx" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-soft bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-700">Foreign-Card Local-Rate Pricing</p>
            <p className="mt-1 text-xs text-gray-500">
              A local (₦) registration paid with a card issued outside Nigeria is charged at the
              black-Surveyrate plus a $5 conversion/processing fee, as a second payment before the
              account activates. The local-rate IP/VPN block is controlled from Super Admin → Flags
              ("Local Rate IP Check").
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Black-SurveyUSD rate (₦ per $1)</span>
              <input
                type="number"
                min="0"
                value={fxConfig.black_market_usd_rate}
                onChange={(e) => setFxConfig((f) => ({ ...f, black_market_usd_rate: Number(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Conversion/processing fee (USD)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={fxConfig.foreign_card_conversion_fee_usd}
                onChange={(e) => setFxConfig((f) => ({ ...f, foreign_card_conversion_fee_usd: Number(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={fxSaving}
            onClick={saveFxConfig}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {fxSaving ? "Saving…" : "Save FX Rules"}
          </button>
        </div>
      )}
    </div>
  );
};

export default SurveyAdminPanel;

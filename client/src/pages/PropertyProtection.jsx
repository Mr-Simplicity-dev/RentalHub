import useProtectionText from "../i18n/useProtectionText";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";
import { actionSpec, actionsFor, fieldOptions, labels, valuesFor, viewsFor } from "../propertyProtection/workflow.cjs";
const base = "/property-protection";
const message = e => e.response?.data?.message || "This action could not be completed. Please try again.";
const format = value => value ? new Date(value).toLocaleDateString() : "—";
const button = "min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50";
const money = value => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN"
}).format(value);
export default function PropertyProtection() {
  const {
    user
  } = useAuth();
  const ui = useProtectionText(user);
  const [query, setQuery] = useSearchParams(),
    selected = query.get("property"),
    view = query.get("view") || "owner";
  const [rows, setRows] = useState([]),
    [hasMore, setHasMore] = useState(false),
    [data, setData] = useState(null),
    [forms, setForms] = useState({}),
    [locations, setLocations] = useState([]),
    [staff, setStaff] = useState([]),
    [services, setServices] = useState([]),
    [configuration, setConfiguration] = useState([]),
    [action, setAction] = useState(null),
    [values, setValues] = useState({}),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const epoch = useRef(0),
    dialog = useRef(null),
    file = useRef(null),
    requestKeys = useRef({}),
    mounted = useRef(true);
  const load = useCallback(async () => {
    const run = ++epoch.current;
    setError("");
    try {
      const response = await api.get(selected ? base + "/" + selected : base, {
        params: selected ? {} : {
          view
        }
      });
      if (run !== epoch.current) return;
      if (selected) {
        setData(response.data.data);
        const available = await api.get(base + "/" + selected + "/services");
        if (run === epoch.current) setServices(available.data.data);
      } else {
        setRows(response.data.data);
        setHasMore(response.data.data.length === 200);
        setData(null);
      }
    } catch (e) {
      if (run === epoch.current) {
        setData(null);
        setError(message(e));
      }
    }
  }, [selected, view]);
  useEffect(() => {
    load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  useEffect(() => {
    mounted.current = true;
    Promise.all([api.get(base + "/forms"), api.get("/property-utils/location-options")]).then(([f, l]) => {
      if (mounted.current) {
        setForms(f.data.data);
        setLocations(l.data.data || []);
      }
    }).catch(e => setError(message(e)));
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (action) dialog.current?.focus();
  }, [action]);
  const more = async () => {
    if (busy || !rows.length) return;
    setBusy(true);
    const current = epoch.current;
    try {
      const r = await api.get(base, {
        params: {
          view,
          before: rows.at(-1).id
        }
      });
      if (current === epoch.current) {
        setRows(previous => [...previous, ...r.data.data]);
        setHasMore(r.data.data.length === 200);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async id => {
    setBusy(true);
    setError("");
    try {
      await api.post(base + "/requests/" + encodeURIComponent(id) + "/verify");
      requestKeys.current = {};
      setNotice("Payment confirmed. Your service request is saved.");
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const id = query.get("request");
    if (id) {
      api.get(base + "/requests/" + encodeURIComponent(id)).then(r => {
        setQuery({
          property: String(r.data.data.property_id)
        });
        return verify(id);
      }).catch(e => setError(message(e)));
    }
  }, []); // A provider return never establishes payment without backend verification.
  const open = async name => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.get(base + "/key");
      setKey(r.data.data.request_id);
      if (data?.permissions.operations) {
        const s = await api.get(base + "/" + selected + "/staff");
        setStaff(s.data.data);
      }
      if (name === "configureService") {
        const c = await api.get(base + "/configuration");
        setConfiguration(c.data.data);
      }
      file.current = null;
      setValues(name === "requestCorrection" ? valuesFor(forms[name], data) : {});
      setAction(name);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const change = (name, value) => {
    if (name === "code" && action === "configureService") {
      const current = configuration.find(x => x.code === value);
      setValues({
        ...current,
        code: value,
        available_states: current?.available_states || []
      });
      return;
    }
    setValues(v => ({
      ...v,
      [name]: value,
      ...(name === "state_id" ? {
        lga_name: ""
      } : {})
    }));
  };
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const spec = actionSpec(action, selected, values, key);
      let body = spec.body,
        headers;
      if (action === "document") {
        if (!file.current) throw Error("Choose a file.");
        body = new FormData();
        Object.entries(spec.body).forEach(([k, v]) => body.append(k, v));
        body.append("file", file.current);
        headers = {
          "Content-Type": "multipart/form-data"
        };
      }
      const r = await api.request({
        url: spec.url,
        method: spec.method,
        data: body,
        headers
      });
      setAction(null);
      setNotice("Saved.");
      if (action === "register") setQuery({
        property: String(r.data.data.id)
      });else await load();
    } catch (e) {
      setError(e.response ? message(e) : e.message);
    } finally {
      setBusy(false);
    }
  };
  const activeService = code => data?.requests.find(row => row.service_code === code && ['pending_payment', 'paid', 'in_progress'].includes(row.status));
  const pay = async service => {
    if (!window.confirm(service.description + "\n\n" + money(service.amount) + "\n\nRequest this service?")) return;
    setBusy(true);
    setError("");
    try {
      if (!requestKeys.current[selected + ":" + service.code]) requestKeys.current[selected + ":" + service.code] = (await api.get(base + "/key")).data.data.request_id;
      const r = await api.post(base + "/" + selected + "/services", {
        service_code: service.code,
        request_id: requestKeys.current[selected + ":" + service.code],
        consent: true
      });
      if (r.data.data.authorization_url) window.location.assign(r.data.data.authorization_url);else setNotice("Your request is saved. Check its payment status below before paying again.");
      await load();
    } catch (e) {
      setError(message(e));
      await load();
    } finally {
      setBusy(false);
    }
  };
  const resume = async id => {
    setBusy(true);
    setError("");
    try {
      const r = await api.post(base + "/requests/" + id + "/resume");
      if (r.data.data.status === "pending_payment" && r.data.data.authorization_url) window.location.assign(r.data.data.authorization_url);else await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const download = async doc => {
    setBusy(true);
    setError("");
    try {
      const r = await api.get(base + "/documents/" + doc.id, {
        responseType: "blob"
      });
      const url = URL.createObjectURL(r.data),
        a = document.createElement("a");
      a.href = url;
      a.download = doc.original_name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError("The private evidence could not be downloaded. Please check access and retention.");
    } finally {
      setBusy(false);
    }
  };
  const control = field => {
    const value = values[field.name] ?? "",
      options = fieldOptions(field, values, data, locations, staff).filter(o => !(action === "representativeReview" && field.name === "status" && data?.permissions.owner && !data?.permissions.operations) || o.value === "revoked"),
      common = {
        id: "pp-" + field.name,
        required: field.required,
        value,
        onChange: e => change(field.name, e.target.value),
        className: "mt-1 min-h-11 w-full rounded-xl border border-slate-300 p-3 text-slate-900"
      };
    if (field.type === "checkbox") return <input id={common.id} type="checkbox" checked={Boolean(value)} required={field.required} onChange={e => change(field.name, e.target.checked)} className="mx-2 h-5 w-5" />;
    if (field.type === "file") return <input id={common.id} type="file" required accept="application/pdf,image/jpeg,image/png,video/mp4" onChange={e => {
      file.current = e.target.files?.[0];
    }} className="mt-2 w-full" />;
    if (field.type === "textarea") return <textarea {...common} rows={3} />;
    if (["documents", "states"].includes(field.type)) return <select {...common} multiple required={false} value={value || []} onChange={e => change(field.name, [...e.target.selectedOptions].map(x => x.value))}>
          {options.map(o => <option key={o.value} value={o.value}>
              {o.label}
            </option>)}
        </select>;
    if (["select", "state", "lga", "staff", "document", "case", "task", "alert"].includes(field.type)) return <select {...common}>
          <option value="">{ui("Choose\u2026")}</option>
          {options.map(o => <option key={o.value} value={o.value}>
              {o.label}
            </option>)}
        </select>;
    return <input {...common} type={["number", "date", "datetime-local"].includes(field.type) ? field.type : "text"} step={field.type === "number" ? "any" : undefined} />;
  };
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-slate-800">
      <div>
        <Link to="/dashboard" className="text-sm underline">
          {ui("Back to dashboard")}
        </Link>
        <h1 className="mt-3 text-3xl font-bold">
          {ui("Amana Property Protection")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6">
          {ui("Basic property registration and case reporting are free. A platform check does not guarantee ownership or freeze an official land record.")}
        </p>
      </div>
      <button type="button" className={button} disabled={busy} onClick={load}>
        {ui("Refresh")}
      </button>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4">
          {notice}
        </p>}
      {!selected ? <>
          <nav className="flex flex-wrap gap-2">
            {viewsFor(user).map(v => <button className={button} key={v} aria-pressed={v === view} onClick={() => setQuery({
          view: v
        })}>
                {labels(v)}
              </button>)}
          </nav>
          <div className="flex flex-wrap gap-2">
            {actionsFor(null, user).map(a => <button key={a} disabled={busy || !forms[a]} className={button} onClick={() => open(a)}>
                {ui(forms[a]?.title || labels(a))}
              </button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(p => <button key={p.id} className="rounded-2xl border bg-white p-5 text-left shadow-sm" onClick={() => setQuery({
          property: String(p.id)
        })}>
                <h2 className="font-bold">{p.title}</h2>
                <p className="mt-2 text-sm">
                  {p.lga_name}
                  {ui(", ")}
                  {p.state_name}
                </p>
                <p className="mt-2 text-sm">{labels(p.verification_status)}</p>
                <p className="mt-2 text-xs">
                  {ui("Registered ")}
                  {format(p.created_at)}
                </p>
              </button>)}
          </div>
          {hasMore && <button className={button} disabled={busy} onClick={more}>
              {ui("Load more properties")}
            </button>}
          {!rows.length && <p>{ui("No property records in this view.")}</p>}
        </> : data && String(data.property.id) === String(selected) ? <>
          <button className={button} onClick={() => setQuery({
        view
      })}>
            {ui("Back to properties")}
          </button>
          <section className="rounded-2xl bg-slate-900 p-6 text-white">
            <h2 className="text-2xl font-bold">{data.property.title}</h2>
            <p className="mt-2">{data.property.address}</p>
            <p className="mt-2">{labels(data.property.verification_status)}</p>
            <p className="mt-2 text-sm">
              {ui("Registered ")}
              {format(data.property.created_at)}
              {ui(" \xB7 Case officer: ")}
              {data.property.case_officer_name || data.property.case_officer_id || "Awaiting assignment"}
            </p>
            {data.property.verification_status === "verified_within_scope" && data.property.verification_scope && <p className="mt-3">
                  {ui("Checked: ")}
                  {data.property.verification_scope}
                  <br />
                  {ui("Limits: ")}
                  {data.property.verification_limitations}
                  <br />
                  {ui("Valid until ")}
                  {format(data.property.verified_until)}
                </p>}
          </section>
          <section>
            {data.property.pending_update && <details className="mb-4 rounded-xl border border-amber-200 p-4">
                <summary>{ui("Record correction awaiting review")}</summary>
                <pre className="overflow-auto whitespace-pre-wrap text-sm">
                  {JSON.stringify(data.property.pending_update, null, 2)}
                </pre>
                <p>{data.property.update_reason}</p>
              </details>}
            <div className="flex flex-wrap gap-2">
              {actionsFor(data, user).map(a => <button key={a} disabled={busy || !forms[a]} className={button} onClick={() => open(a)}>
                  {ui(forms[a]?.title || labels(a))}
                </button>)}
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-bold">{ui("Verification progress")}</h2>
            {data.checks.map(c => <details key={c.stage} className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold">
                  {labels(c.stage)}
                  {ui(" \u2014 ")}
                  {labels(c.status)}
                </summary><p className="mt-2 text-sm">{ui('Assigned reviewer')}: {c.assigned_name || ui('Awaiting assignment')}</p>
                <p className="mt-3 whitespace-pre-wrap">
                  {c.public_summary || "This check is not complete."}
                </p>
                {c.review_reason && <p className="mt-2">
                    {ui("Review: ")}
                    {c.review_reason}
                  </p>}
                {c.private_findings && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-amber-50 p-3">
                    {ui("Confidential professional findings: ")}
                    {c.private_findings}
                  </p>}
                <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(c.source_details, null, 2)}
                </pre>
                {c.history?.length > 0 && <details className="mt-3">
                    <summary>{ui("Previous decisions")}</summary>
                    {c.history.map((h, i) => <p key={i} className="mt-2 text-sm">
                        {labels(h.status)}
                        {ui(" \u2014 ")}
                        {h.review_reason || h.public_summary}
                      </p>)}
                  </details>}
              </details>)}
          </section>
          <section>
            <h2 className="mb-3 text-xl font-bold">{ui("Private evidence")}</h2>
            <p className="mb-3 text-sm">
              {ui("No single document proves ownership. Files require security scanning and permission to download.")}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.documents.map(d => <button key={d.id} className={button} disabled={busy} onClick={() => download(d)}>
                  {d.original_name}
                </button>)}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-xl font-bold">
              {ui("Optional paid checks")}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {services.map(s => <article key={s.code} className="rounded-2xl border p-4">
                  <h3 className="font-bold">{labels(s.code)}</h3>
                  <p className="my-2 text-sm">{s.description}</p>
                  {s.code === "monitoring" && s.period_days && <p className="mb-2 text-sm">
                      {s.period_days}
                      {ui(" days; checks every ")}
                      {s.cadence_days}
                      {ui(" days. Renewal is optional.")}
                    </p>}
                  <button disabled={busy || !s.available || !data.permissions.owner && !data.permissions.can_request_services || Boolean(activeService(s.code))} className={button} onClick={() => pay(s)}>{activeService(s.code) ? ui("Request already in progress") : s.available ? (s.code === "monitoring" && data.monitoring ? ui("Renew monitoring") : ui("Request")) + (" \u2014 " + money(s.amount)) : ui("Not available for this location")}</button>
                </article>)}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-xl font-bold">
              {ui("Service requests and payments")}
            </h2>
            {data.requests.map(r => <div key={r.id} className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <div>
                  {labels(r.service_code)}
                  {ui(" \xB7 ")}
                  {money(r.amount)}
                  {ui(" \xB7 ")}
                  {labels(r.status)}
                  <p className="text-xs">{r.id}</p>
                </div>
                {r.status === "pending_payment" && <button className={button} disabled={busy} onClick={() => verify(r.id)}>
                    {ui("Check payment status")}
                  </button>}
                {r.status === "pending_payment" && Number(r.user_id) === Number(user.id) && <button className={button} disabled={busy} onClick={() => resume(r.id)}>
                      {ui("Resume checkout")}
                    </button>}
              </div>)}
          </section>
          <section>
            <h2 className="mb-3 text-xl font-bold">{ui("Inspections")}</h2>
            {data.inspections.map(i => <details key={i.id} className="mb-2 rounded-xl border p-4">
                <summary>
                  {ui("#")}
                  {i.id}
                  {ui(" \u2014 ")}
                  {labels(i.status)}
                  {ui(" \u2014 ")}
                  {format(i.scheduled_at)}
                </summary>
                <p className="mt-2 whitespace-pre-wrap">
                  {i.inspection_summary}
                </p>
                <pre className="overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(i.inspection_findings, null, 2)}
                </pre>
                <p>{i.supervisor_note}</p>
              </details>)}
          </section>
          <section>
            <h2 className="mb-3 text-xl font-bold">{ui("Monitoring")}</h2>
            <p>
              {data.monitoring ? data.monitoring.cancelled_at ? "Stopped" : "Active until " + format(data.monitoring.active_until) : "Not subscribed"}
            </p>
            {data.monitoring && data.permissions.owner && !data.monitoring.cancelled_at && <button disabled={busy} className={button} onClick={async () => {
          setBusy(true);
          try {
            await api.patch(base + "/" + selected + "/monitoring", {
              stopped: true
            });
            await load();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}>
                  {ui("Stop future monitoring checks")}
                </button>}
          </section>
          <section>
            <h2 className="mb-3 text-xl font-bold">
              {ui("Alerts for review")}
            </h2>
            {data.alerts.map(a => <article key={a.id} className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="font-bold">
                  {labels(a.category)}
                  {ui(" \u2014 ")}
                  {labels(a.status)}
                </h3>
                <p>{a.summary}</p>
                <p className="mt-2 text-sm">{a.review_note}</p>
              </article>)}
          </section>
          <section>
            <h2 className="mb-3 text-xl font-bold">{ui("Cases")}</h2>
            <p className="mb-3 text-sm">
              {ui("Messages and evidence stay in the existing case conversation. A closed case does not establish ownership.")}
            </p>
            {data.cases.map(c => <Link className="mb-2 block rounded-xl border p-4 underline" key={c.id} to={"/dispute/" + c.id}>
                {c.title}
                {ui(" \u2014 ")}
                {labels(c.status)}
              </Link>)}
          </section>
          <section>
            <h2 className="mb-3 text-xl font-bold">
              {ui("Representative authority")}
            </h2>
            {data.representatives.map(r => <p key={r.user_id} className="mb-2 rounded-xl border p-3">
                {r.full_name}
                {ui(" \xB7 Account ")}
                {r.user_id}
                {ui(" \xB7 ")}
                {labels(r.status)}
                {ui(" \xB7 Expires ")}
                {format(r.expires_at)}
                <br />
                {r.authority_description}
              </p>)}
          </section>
        </> : <p>{ui("Loading property\u2026")}</p>}
      {action && forms[action] && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3" onKeyDown={e => {
      if (e.key === "Escape" && !busy) setAction(null);
      if (e.key === "Tab") {
        const items = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }}>
          <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pp-form-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="pp-form-title" className="text-xl font-bold">
                {ui(forms[action].title)}
              </h2>
              <button type="button" className={button} disabled={busy} onClick={() => setAction(null)}>
                {ui("Close")}
              </button>
            </div>
            {error && <p role="alert" className="mb-3 text-red-700">
                {error}
              </p>}
            <form onSubmit={submit} className="space-y-4">
              {forms[action].fields.map(f => <div key={f.name}>
                  <label htmlFor={"pp-" + f.name} className="block text-sm font-semibold">
                    {ui(f.label)}
                    {f.required ? " *" : ""}
                  </label>
                  {control(f)}
                </div>)}
              <button className={button + " bg-amber-300"} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </form>
          </section>
        </div>}
    <>{data?.permissions.operations && <section><h2 className="text-xl font-bold">{ui('Review history')}</h2>{(data.operations || []).map(item => <p key={item.id} className="mt-2 rounded-xl border p-3 text-sm">{format(item.created_at)} — {item.actor_name || ui('Staff')} — {ui(labels(item.action.replace('PROTECTION_', '')))}</p>)}</section>}{data?.property.record_history?.length > 0 && <section><h2 className="text-xl font-bold">{ui('Record history')}</h2>{data.property.record_history.map((item, index) => <p key={index} className="mt-2 text-sm">{format(item.reviewed_at)} — {item.reason}</p>)}</section>}</></main>;
}

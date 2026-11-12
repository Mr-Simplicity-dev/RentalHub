import useProtectionText from "../../i18n/useProtectionText";
import React, { useContext, useEffect, useState } from "react";
import { SocketContext } from "../../context/SocketContext";
import { useAuth } from "../../hooks/useAuth";
import api from "../../services/api";
export default function PropertyCaseTools({
  dispute,
  professional = false,
  onSaved
}) {
  const {
    user
  } = useAuth();
  const ui = useProtectionText(user);
  const socket = useContext(SocketContext),
    [people, setPeople] = useState([]),
    [meetings, setMeetings] = useState([]),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api.get("/property-protection/cases/" + dispute.id + "/meeting-participants"), api.get("/property-protection/cases/" + dispute.id + "/meetings")]).then(([p, m]) => {
      if (active) {
        setPeople(p.data.data.filter(x => Number(x.id) !== Number(user.id)));
        setMeetings(m.data.data);
      }
    }).catch(() => {
      if (active) setError("Case meeting details could not be loaded. Refresh to retry.");
    });
    return () => {
      active = false;
    };
  }, [dispute.id, user.id]);
  const call = async callType => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await socket?.startCall({
        receiverId: Number(target),
        disputeId: dispute.id,
        callType
      });
      if (!r?.success) setError(r?.message || "The case meeting could not start.");
    } catch {
      setError("The case meeting could not start.");
    } finally {
      setBusy(false);
    }
  };
  return <section className="space-y-4 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-bold">{ui("Case meetings and review")}</h2>
      <p className="text-sm text-slate-600">
        {ui("Only approved participants can join. Meeting times and status are saved. Conversations are not recorded.")}
      </p>
      {error && <p role="alert" className="text-red-700">
          {error}
        </p>}
      <div className="flex flex-wrap gap-2">
        <select aria-label="Approved meeting participant" value={target} onChange={e => setTarget(e.target.value)} className="min-h-11 max-w-full rounded-lg border p-2">
          <option value="">{ui("Choose participant")}</option>
          {people.map(p => <option key={p.id} value={p.id}>
              {p.full_name}
            </option>)}
        </select>
        {["audio", "video"].map(type => <button key={type} disabled={busy || !target || dispute.is_legally_sealed || ["closed", "resolved"].includes(dispute.status)} onClick={() => call(type)} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">
            {type === "audio" ? "Audio meeting" : "Video meeting"}
          </button>)}
      </div>
      <details>
        <summary className="cursor-pointer">
          {ui("Meeting history (")}
          {meetings.length}
          {ui(")")}
        </summary>
        {meetings.map(m => <p key={m.id} className="mt-2 text-sm">
            {m.call_type}
            {ui(" \xB7 ")}
            {m.status}
            {ui(" \xB7 ")}
            {new Date(m.requested_at).toLocaleString()}
            {m.ended_at ? " — " + new Date(m.ended_at).toLocaleString() : ""}
          </p>)}
      </details>
      {dispute.protection_outcome && <p className="rounded-lg bg-slate-50 p-3 text-sm">
          {ui("Outcome: ")}
          {dispute.protection_outcome.replaceAll("_", " ")}
          <br />
          {dispute.resolution}
          <br />
          {ui("Limits: ")}
          {dispute.outcome_limitations}
        </p>}
      {professional && <form className="space-y-3 border-t pt-4" onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      setError("");
      try {
        await api.post("/legal/disputes/" + dispute.id + "/notes", {
          title,
          content,
          is_visible_to_client: visible
        });
        setTitle("");
        setContent("");
        setVisible(false);
        await onSaved?.();
      } catch (e) {
        setError(e.response?.data?.message || "The assessment could not be saved.");
      } finally {
        setBusy(false);
      }
    }}>
          <h3 className="font-semibold">
            {ui("Assigned professional assessment")}
          </h3>
          <label className="block text-sm">
            {ui("Title")}
            <input required className="mt-1 min-h-11 w-full rounded-lg border p-2" value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            {ui("Findings, missing evidence and limitations")}
            <textarea required minLength={15} className="mt-1 w-full rounded-lg border p-2" rows={4} value={content} onChange={e => setContent(e.target.value)} />
          </label>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
            {ui("Share this note with the record holder. Leave off for a confidential internal note.")}
          </label>
          <button disabled={busy} className="min-h-11 rounded-lg border px-4">
            {ui("Save assessment")}
          </button>
        </form>}
    <details><summary className="cursor-pointer font-semibold">{ui('Outcome history')}</summary>{(dispute.protection_outcome_history || []).map((item, index) => <article key={index} className="mt-3 rounded-xl border p-3 text-sm"><p>{new Date(item.recorded_at).toLocaleString()} — {ui(item.outcome.replaceAll('_', ' '))}</p><p>{item.summary}</p><p>{item.limitations}</p></article>)}</details></section>;
}

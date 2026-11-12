const test = require("node:test"),
  assert = require("node:assert/strict"),
  Module = require("node:module"),
  path = require("path");
test("shared case history excludes private notes, request bodies and contact emails", async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      let rows = [];
      if (sql.includes("FROM disputes d") && sql.includes("opener.full_name"))
        rows = [
          {
            id: 1,
            property_id: null,
            protection_property_id: 4,
            opened_by: 1,
            against_user: 2,
            title: "Shared case",
            description: "Shared case description",
            created_at: "2026-01-01",
            status: "open",
            opened_by_email: "owner@example.test",
            against_email: "other@example.test",
          },
        ];
      else if (sql.includes("SELECT p.title"))
        rows = [
          { title: "Private property", state_name: "Lagos", city: "Ikeja" },
        ];
      else if (sql.includes("FROM dispute_messages"))
        rows = [
          {
            id: 1,
            message: "Shared case message",
            sender_email: "private@example.test",
            created_at: "2026-01-01",
          },
        ];
      else if (sql.includes("FROM dispute_evidence"))
        rows = [
          {
            id: 4,
            file_name: "case.pdf",
            file_path: "/private/SECRET.pdf",
            lawyer_notes: "SECRET professional assessment",
            uploaded_by_email: "private@example.test",
            created_at: "2026-01-01",
          },
        ];
      else if (sql.includes("FROM audit_logs l"))
        rows = [
          {
            id: 7,
            action: "Added case note",
            metadata: { note_id: 99 },
            request_body: { content: "SECRET" },
            response_body: { content: "SECRET" },
            created_at: "2026-01-01",
          },
          {
            id: 8,
            action: "Case update",
            metadata: { private_note: "SECRET" },
            request_body: { content: "SECRET" },
            response_body: { content: "SECRET" },
            created_at: "2026-01-01",
          },
        ];
      else if (sql.includes("FROM lawyer_case_notes")) {
        assert.equal(params[1], false);
        assert.equal(params[2], 1);
        rows = [
          {
            id: 10,
            title: "Shared note",
            content: "Shared record-holder note",
          },
        ];
      }
      return { rows: JSON.parse(JSON.stringify(rows)) };
    },
  };
  const original = Module._load;
  let service;
  try {
    Module._load = function (request, parent, ...rest) {
      if (request === "../config/middleware/database") return db;
      if (request === "./disputeNotificationService")
        return { notifyDispute: async () => {} };
      if (request === "../config/utils/auditLogger")
        return { logAction: async () => {} };
      if (request === "../config/utils/legalSchema")
        return { ensureLawyerCaseNotesSchema: async () => {} };
      if (request.startsWith("../models/")) return {};
      if (
        request === "../services/merkleEvidence.service" ||
        request === "../services/evidenceAnchor.service"
      )
        return {};
      return original.call(this, request, parent, ...rest);
    };
    const name = path.resolve(__dirname, "../../services/disputeService.js");
    delete require.cache[name];
    service = require(name);
  } finally {
    Module._load = original;
  }
  let result,
    status = 200;
  const res = {
    status: (value) => {
      status = value;
      return res;
    },
    json: (value) => {
      result = value;
      return res;
    },
  };
  await service.getDisputeDetails(
    {
      params: { disputeId: "1" },
      user: { id: 1, user_type: "tenant" },
      logger: { error: () => {} },
    },
    res,
  );
  assert.equal(status, 200);
  const serialized = JSON.stringify(result);
  assert.match(serialized, /Shared case message/);
  assert.match(serialized, /Shared record-holder note/);
  assert.doesNotMatch(
    serialized,
    /SECRET|private@example|owner@example|other@example/,
  );
  assert.ok(
    calls
      .find((c) => c.sql.includes("FROM audit_logs l"))
      .sql.includes("l.id,l.actor_id"),
  );
  assert.equal(result.data.audit_logs.length, 1);
  assert.equal(result.data.audit_logs[0].metadata, null);
});

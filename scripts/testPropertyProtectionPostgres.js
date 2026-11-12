const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict"),
  crypto = require("crypto");
const name = process.argv[2];
if (!/^rentalhub_protection_review_[a-z0-9_]+$/.test(name || ""))
  throw Error("A separate protection review database is required.");
const { Pool } = require("pg"),
  { createService } = require("../services/propertyProtectionService"),
  { createPaymentService } = require("../services/propertyProtectionPayments");
const db = new Pool({
  host: "/var/run/postgresql",
  user: "postgres",
  database: name,
  max: 12,
});
(async () => {
  await db.query(`CREATE TABLE users(id INTEGER PRIMARY KEY,user_type TEXT,full_name TEXT,email TEXT,identity_verified BOOLEAN DEFAULT TRUE,is_active BOOLEAN DEFAULT TRUE,deleted_at TIMESTAMP,account_suspended_at TIMESTAMP,account_suspended_reason TEXT,assigned_state TEXT,assigned_zone TEXT,assigned_state_id INTEGER,assigned_lga_name TEXT,assigned_city TEXT);
 CREATE TABLE states(id INTEGER PRIMARY KEY,state_name TEXT);
 CREATE TABLE properties(id SERIAL PRIMARY KEY,landlord_id INTEGER REFERENCES users(id),state_id INTEGER REFERENCES states(id),full_address TEXT);
 CREATE TABLE payments(id SERIAL PRIMARY KEY,user_id INTEGER,payer_user_id INTEGER,payment_type TEXT,amount NUMERIC,currency TEXT,transaction_reference TEXT UNIQUE,payment_status TEXT,payment_method TEXT,consent_confirmed BOOLEAN,completed_at TIMESTAMPTZ,gateway_response JSONB);
 CREATE TABLE property_inspection_requests(id SERIAL PRIMARY KEY,property_id INTEGER NOT NULL,application_id INTEGER NOT NULL,tenant_id INTEGER,amount NUMERIC,payment_id INTEGER,status TEXT,paid_at TIMESTAMPTZ,requested_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),started_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,inspection_summary TEXT,inspection_findings JSONB);
 CREATE TABLE disputes(id SERIAL PRIMARY KEY,property_id INTEGER,opened_by INTEGER,against_user INTEGER,title TEXT,description TEXT,priority TEXT,status TEXT DEFAULT 'open',responsible_support_id INTEGER,is_legally_sealed BOOLEAN DEFAULT FALSE,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),resolution TEXT,resolved_by INTEGER,resolved_at TIMESTAMPTZ);
 CREATE TABLE dispute_evidence(id SERIAL PRIMARY KEY,dispute_id INTEGER,file_hash TEXT,uploaded_at TIMESTAMP DEFAULT NOW());
 INSERT INTO dispute_evidence(dispute_id,uploaded_at,file_hash) VALUES(NULL,'2020-01-01',repeat('c',64));
 CREATE TABLE call_sessions(id UUID PRIMARY KEY,status TEXT,ended_at TIMESTAMPTZ);
 CREATE TABLE notifications(id SERIAL PRIMARY KEY,user_id INTEGER,dedup_key TEXT);
 CREATE TABLE audit_logs(id SERIAL PRIMARY KEY,actor_id INTEGER,action TEXT,target_type TEXT,target_id INTEGER,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE platform_lawyers(id SERIAL PRIMARY KEY,lawyer_user_id INTEGER,is_active BOOLEAN);
 CREATE TABLE platform_agents(id SERIAL PRIMARY KEY,agent_user_id INTEGER,is_active BOOLEAN);
 INSERT INTO states VALUES(1,'Lagos'),(2,'Kogi');
 INSERT INTO users(id,user_type,full_name,email,assigned_state,assigned_state_id,assigned_lga_name) VALUES(1,'landlord','Owner','owner@example.com',NULL,NULL,NULL),(2,'tenant','Other','other@example.com',NULL,NULL,NULL),(3,'super_admin','Supervisor','super@example.com',NULL,NULL,NULL),(4,'tenant','Representative','rep@example.com',NULL,NULL,NULL),(5,'agent','Inspector','agent@example.com','Lagos',1,'Ikeja'),(6,'state_admin','Wrong state','wrong@example.com','Kogi',2,NULL);`);
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/2049_property_protection.sql"),
    "utf8",
  );
  await db.query(migration);
  await db.query(migration);
  console.log("PASS additive migration can be applied twice");
  const legacyEvidence = (
    await db.query(
      "SELECT created_at,uploaded_at FROM dispute_evidence WHERE id=1",
    )
  ).rows[0];
  assert.equal(
    legacyEvidence.created_at.toISOString(),
    legacyEvidence.uploaded_at.toISOString(),
  );
  console.log(
    "PASS old evidence timestamps are preserved when adding the compatible history column",
  );
  const audit = [],
    alerts = [],
    closed = [];
  const svc = createService({
    db,
    audit: async (x) => audit.push(x),
    notify: async (...x) => alerts.push(x),
    locations: async () => ({ lga_name: "Ikeja" }),
    closeMeetings: async (...x) => closed.push(x),
    identityConflict: async () => false,
    contactGuard: async () => {},
  });
  const owner = { id: 1, user_type: "landlord", email: "owner@example.com" },
    other = { id: 2, user_type: "tenant" },
    supervisor = { id: 3, user_type: "super_admin" },
    rep = { id: 4, user_type: "tenant" };
  const input = {
    submission_id: crypto.randomUUID(),
    title: "Family parcel",
    property_type: "land",
    state_id: 1,
    lga_name: "Ikeja",
    address: "Parcel near market",
    parcel_number: "P-123",
    survey_number: "SV-9",
    acquisition_method: "inheritance",
    ownership_capacity: "family",
    ownership_details: {
      name: "The family",
      authority: "Members approved the recorded representative",
    },
  };
  const records = await Promise.all(
    Array.from({ length: 4 }, () => svc.create(owner, input)),
  );
  const id = records[0].id;
  assert.equal(new Set(records.map((r) => r.id)).size, 1);
  assert.equal(
    (await db.query("SELECT COUNT(*)::int n FROM payments")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("SELECT COUNT(*)::int n FROM protection_checks")).rows[0].n,
    7,
  );
  console.log(
    "PASS free unlisted family registration, seven stages and concurrent retry safety",
  );
  await assert.rejects(svc.access(other, id), /not found/);
  await assert.rejects(
    svc.access(
      { id: 6, user_type: "state_admin", assigned_state: "Kogi" },
      id,
      { officer: true },
    ),
    /different authorised/,
  );
  console.log("PASS unrelated customer and out-of-area administrator denied");
  const duplicate = await svc.create(
    { ...other, email: "other@example.com" },
    { ...input, submission_id: crypto.randomUUID() },
  );
  assert.ok(
    (
      await db.query(
        "SELECT 1 FROM protection_alerts WHERE property_id=$1 AND category='amana_platform'",
        [duplicate.id],
      )
    ).rows.length,
  );
  console.log(
    "PASS matching parcel creates investigation alert, not a fraud decision",
  );
  await svc.representatives(owner, id, {
    user_id: 4,
    capacity: "family",
    authority_description: "Recorded authority from the family members",
    expires_at: "2999-01-01",
    can_upload: true,
    can_open_cases: true,
  });
  await assert.rejects(svc.access(rep, id), /not found/);
  await assert.rejects(
    svc.reviewRepresentative(owner, id, {
      user_id: 4,
      status: "approved",
      reason: "This owner cannot approve authority alone",
    }),
    /independent supervisor/,
  );
  await db.query(
    "INSERT INTO protection_documents(id,property_id,uploaded_by,kind,original_name,storage_name,mime_type,file_size,sha256,scan_status,retain_until,retention_consent) VALUES($1,$2,1,'authority','authority.pdf',$3,'application/pdf',12,$4,'clean','2999-01-01',TRUE)",
    [crypto.randomUUID(), id, crypto.randomUUID() + ".pdf", "a".repeat(64)],
  );
  await svc.reviewRepresentative(supervisor, id, {
    user_id: 4,
    status: "approved",
    reason: "Authority evidence reviewed independently",
  });
  assert.equal((await svc.access(rep, id)).rep.can_upload, true);
  await svc.reviewRepresentative(owner, id, {
    user_id: 4,
    status: "revoked",
    reason: "The family removed this authority today",
  });
  await assert.rejects(svc.access(rep, id), /not found/);
  console.log(
    "PASS reviewed representative approval and immediate owner revocation",
  );
  const pay = createPaymentService({
    db,
    protection: svc,
    pricing: async () => ({
      matched_rule: { id: 1 },
      amount: 2500,
      currency: "NGN",
    }),
    post: async () => ({
      data: {
        status: true,
        data: { authorization_url: "https://checkout.paystack.com/test" },
      },
    }),
    get: async () => ({
      data: {
        status: true,
        data: {
          status: "success",
          reference: receipt.reference,
          currency: "NGN",
          amount: 250000,
          customer: { email: "owner@example.com" },
        },
      },
    }),
    notify: async () => {},
    audit: async () => {},
    env: { PAYSTACK_SECRET_KEY: "fake-test-key" },
  });
  let receipt = {};
  await assert.rejects(
    pay.request(owner, id, {
      request_id: crypto.randomUUID(),
      service_code: "registry",
      consent: true,
    }),
    /not been defined/,
  );
  await pay.configure(supervisor, "registry", {
    description:
      "A manual registry search with a written report and explicit limitations.",
    enabled: true,
    available_states: [1],
  });
  const requestKey = crypto.randomUUID();
  const orders = await Promise.all(
    Array.from({ length: 3 }, () =>
      pay.request(owner, id, {
        request_id: requestKey,
        service_code: "registry",
        consent: true,
        amount: 1,
      }),
    ),
  );
  assert.equal(new Set(orders.map((o) => o.id)).size, 1);
  assert.equal(
    (await db.query("SELECT COUNT(*)::int n FROM payments")).rows[0].n,
    1,
  );
  assert.equal(Number(orders[0].amount), 2500);
  receipt.reference = orders[0].transaction_reference;
  await pay.reconcile(orders[0].id, owner);
  await pay.reconcile(orders[0].id, owner);
  assert.equal(
    (await db.query("SELECT payment_status FROM payments")).rows[0]
      .payment_status,
    "completed",
  );
  console.log(
    "PASS disabled service blocked, authoritative pricing, concurrent checkout and idempotent settlement",
  );
  const anotherOwned = await svc.create(owner, {
    ...input,
    submission_id: crypto.randomUUID(),
    parcel_number: "P-987",
    survey_number: "SV-987",
    address: "Another family parcel",
  });
  await assert.rejects(
    pay.request(owner, anotherOwned.id, {
      request_id: requestKey,
      service_code: "registry",
      consent: true,
    }),
    /another property service/,
  );
  console.log("PASS a retry key cannot be reused for a different property");
  await db.query(
    "UPDATE protection_checks SET private_findings='Confidential professional opinion' WHERE property_id=$1 AND stage='professional'",
    [id],
  );
  assert.equal(
    (await svc.details(owner, id)).checks.find(
      (c) => c.stage === "professional",
    ).private_findings,
    undefined,
  );
  assert.equal(
    (await svc.details(supervisor, id)).checks.find(
      (c) => c.stage === "professional",
    ).private_findings,
    undefined,
  );
  console.log(
    "PASS confidential professional findings hidden from customer and ordinary operations",
  );

  await db.query(
    "INSERT INTO users(id,user_type,full_name,email,assigned_state) VALUES(7,'lawyer','Reviewer','review@example.com','Lagos'),(8,'super_admin','Independent supervisor','reviewer@example.com',NULL); INSERT INTO platform_agents(agent_user_id,is_active) VALUES(5,TRUE); INSERT INTO platform_lawyers(lawyer_user_id,is_active) VALUES(7,TRUE); INSERT INTO users(id,user_type,full_name,email,assigned_state) VALUES(9,'state_support_admin','Case officer','officer@example.com','Lagos'),(10,'state_admin','Operations','operations@example.com','Lagos')",
  );
  const independent = { id: 8, user_type: "super_admin" },
    agent = {
      id: 5,
      user_type: "agent",
      identity_verified: true,
      assigned_state_id: 1,
      assigned_lga_name: "Ikeja",
    },
    professional = {
      id: 7,
      user_type: "lawyer",
      identity_verified: true,
      assigned_state: "Lagos",
    };
  const doc = (
    await db.query("SELECT id FROM protection_documents WHERE property_id=$1", [
      id,
    ])
  ).rows[0].id;
  const source = {
    source: "Registry evidence",
    office: "State registry",
    state: "Lagos",
    reference: "Search-1",
    search_date: "2026-01-01",
    result: "Recorded result for the specified parcel",
    limitations: "Only the stated records were searched",
    qualification_reference: "Independent report authority REF-7",
  };
  for (const stage of ["documents", "consistency", "registry"]) {
    await svc.assign(supervisor, id, { stage, assigned_to: 3 });
    await svc.submitCheck(supervisor, id, stage, {
      summary: "Checked source evidence and recorded its limitations",
      document_ids: [doc],
      source_details: source,
    });
    await assert.rejects(
      svc.reviewCheck(supervisor, id, stage, {
        status: "approved",
        reason: "Self review must never be allowed here",
      }),
      /Another supervisor/,
    );
    await svc.reviewCheck(independent, id, stage, {
      status: "approved",
      reason: "Evidence checked independently against the recorded scope",
    });
  }
  const paid = async (code) => {
    await pay.configure(supervisor, code, {
      description:
        "A defined independent review with a report and stated limits.",
      enabled: true,
      available_states: [1],
    });
    const order = await pay.request(owner, id, {
      request_id: crypto.randomUUID(),
      service_code: code,
      consent: true,
    });
    receipt.reference = order.transaction_reference;
    await pay.reconcile(order.id, owner);
    return order;
  };
  await paid("survey");
  await svc.assign(supervisor, id, { stage: "survey", assigned_to: 5 });
  await svc.submitCheck(agent, id, "survey", {
    summary: "Survey report collected and checked within the stated scope",
    document_ids: [doc],
    source_details: source,
  });
  await svc.reviewCheck(independent, id, "survey", {
    status: "approved",
    reason: "Report authority and limits reviewed independently",
  });
  await paid("inspection");
  await svc.assign(supervisor, id, { stage: "inspection", assigned_to: 5 });
  const task = (
    await db.query(
      "SELECT id FROM property_inspection_requests WHERE protection_property_id=$1 AND protection_purpose='verification'",
      [id],
    )
  ).rows[0];
  const evidence = crypto.randomUUID();
  await db.query(
    "INSERT INTO protection_documents(id,property_id,inspection_id,uploaded_by,kind,original_name,storage_name,mime_type,file_size,sha256,scan_status,retain_until,retention_consent) VALUES($1,$2,$3,5,'inspection','site.jpg',$4,'image/jpeg',12,$5,'clean','2999-01-01',TRUE)",
    [evidence, id, task.id, crypto.randomUUID() + ".jpg", "b".repeat(64)],
  );
  const inspections =
    require("../services/propertyProtectionInspections").createInspections({
      db,
      protection: svc,
      audit: async () => {},
      notify: async () => {},
    });
  await inspections.action(agent, task.id, { action: "start" });
  await inspections.action(agent, task.id, {
    action: "submit",
    attendance: "attended",
    summary:
      "Physical attendance, conditions and boundary observations recorded",
    conditions: "Visible conditions only",
    document_ids: [evidence],
    location_permission: true,
    latitude: 6.5,
    longitude: 3.3,
  });
  await inspections.action(independent, task.id, {
    action: "review",
    decision: "approved",
    reason: "Attendance, evidence and limitations checked independently",
  });
  assert.equal(
    (
      await db.query(
        "SELECT status FROM property_inspection_requests WHERE id=$1",
        [task.id],
      )
    ).rows[0].status,
    "completed",
  );
  console.log(
    "PASS assigned physical inspection, attendance, permitted GPS, evidence and independent supervisor review",
  );
  await paid("professional");
  await svc.assign(supervisor, id, { stage: "professional", assigned_to: 7 });
  await svc.submitCheck(professional, id, "professional", {
    summary: "Title assessment completed within the stated scope",
    private_findings: "Confidential report for the assigned professional only",
    document_ids: [doc],
    source_details: source,
  });
  await svc.reviewCheck(independent, id, "professional", {
    status: "approved",
    reason: "Required report and public limitations checked independently",
  });
  assert.equal(
    (await svc.details(owner, id)).checks.find(
      (x) => x.stage === "professional",
    ).private_findings,
    undefined,
  );
  assert.match(
    (await svc.details(professional, id)).checks.find(
      (x) => x.stage === "professional",
    ).private_findings,
    /Confidential/,
  );
  await svc.reviewCheck(independent, id, "final", {
    status: "approved",
    reason: "All seven checks have an independently reviewed record",
    scope: "The recorded registry, survey, site and title documents only",
    limitations: "No guarantee of ownership or official title freeze",
    valid_until: "2099-01-01",
  });
  assert.equal(
    (await svc.details(owner, id)).property.verification_status,
    "verified_within_scope",
  );
  console.log(
    "PASS seven-stage verification, no self approval, restricted professional findings and scoped expiring final decision",
  );
  const reported = await svc.openCase(owner, id, {
    request_id: crypto.randomUUID(),
    title: "Competing claim reported",
    description:
      "The record holder requests review of a competing ownership claim.",
  });
  const operator = {
      id: 10,
      user_type: "state_admin",
      assigned_state: "Lagos",
    },
    officer = {
      id: 9,
      user_type: "state_support_admin",
      assigned_state: "Lagos",
    };
  await assert.rejects(
    svc.caseAccess(operator, reported.id),
    /not an authorised participant/,
  );
  await svc.participants(operator, reported.id, {
    user_id: 9,
    capacity: "officer",
    authority_reason: "The named support officer is authorised for this state",
  });
  assert.equal(
    (await svc.details(officer, id)).permissions.case_operations,
    true,
  );
  await svc.outcome(officer, reported.id, {
    outcome: "evidence_for_review",
    summary:
      "The named support officer has recorded the next evidence-review step.",
    limitations: "This is a case update, not a title decision.",
  });
  console.log(
    "PASS scoped operations triage and named support-officer case duties without exposing unassigned conversations",
  );
  await svc.participants(supervisor, reported.id, {
    user_id: 2,
    capacity: "respondent",
    authority_reason:
      "The competing claimant account was checked independently",
  });
  assert.equal((await svc.meeting(1, 2, reported.id)).id, reported.id);
  await svc.participants(supervisor, reported.id, {
    user_id: 2,
    revoked: true,
    authority_reason: "The participant authority was removed after review",
  });
  await assert.rejects(svc.meeting(1, 2, reported.id), /revoked/);
  assert.ok(closed.some((x) => x[0] === reported.id && x[1] === 2));
  console.log(
    "PASS existing dispute case, approved meeting participants and immediate meeting revocation",
  );
  await svc.outcome(supervisor, reported.id, {
    outcome: "resolved_between_parties",
    summary:
      "The parties recorded their agreed next step through the case review.",
    limitations: "This is not a land registry title decision.",
  });
  await assert.rejects(svc.meeting(1, 3, reported.id), /not open/);
  await assert.rejects(
    svc.outcome(supervisor, reported.id, {
      outcome: "reopened_with_new_evidence",
      summary: "Reopen this case with a recorded new evidence item.",
      limitations: "No ownership decision is made here.",
    }),
    /Upload the new case evidence/,
  );
  assert.ok(
    (
      await db.query(
        "SELECT protection_outcome_history FROM disputes WHERE id=$1",
        [reported.id],
      )
    ).rows[0].protection_outcome_history.length >= 2,
  );
  console.log(
    "PASS outcome history is retained and reopening requires new shared evidence",
  );
  await svc.requestCorrection(owner, id, {
    ...input,
    owner_id: 2,
    title: "Corrected family parcel",
    reason: "The family requested correction of the recorded property title",
  });
  await svc.reviewCorrection(independent, id, {
    status: "approved",
    reason: "Identity, authority and supporting property evidence checked",
  });
  const corrected = await svc.details(owner, id);
  assert.equal(Number(corrected.property.owner_id), 1);
  assert.equal(corrected.property.title, "Corrected family parcel");
  assert.equal(corrected.property.record_history.length, 1);
  assert.ok(corrected.checks.every((x) => x.status === "pending"));
  console.log(
    "PASS reviewed record correction keeps history, resets checks and cannot transfer account ownership",
  );

  await db.query(
    "INSERT INTO properties(landlord_id,state_id,full_address) VALUES(2,1,$1)",
    [input.address],
  );
  await svc.sweepDuplicates();
  assert.ok(
    (
      await db.query(
        "SELECT 1 FROM protection_alerts WHERE property_id=$1 AND rule_key LIKE 'listing:%'",
        [id],
      )
    ).rows.length,
  );
  console.log(
    "PASS ongoing matching detects a listing added after the private property record",
  );
  await require("./testProtectionCallWorkers")(db, reported.id);
  assert.ok(audit.length > 0);
  console.log(
    "PASS audit events recorded. No real payment, message or identity request was sent.",
  );
})()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => db.end());

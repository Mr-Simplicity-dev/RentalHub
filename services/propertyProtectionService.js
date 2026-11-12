const crypto = require("crypto");
const policy = require("./propertyProtectionPolicy");
const {
  OPS,
  PRO,
  STAGES,
  OUTCOMES,
  fail,
  text,
  uuid,
  propertyInput,
  sourceInput,
  finalDecision
} = policy;
const {
  statesMatch,
  lawyerTerritoryMatches
} = require("../config/utils/stateScope");
const {
  zoneContainsState
} = require("../config/utils/territorialZones");
function createService({
  db,
  notify,
  audit,
  locations,
  pricing,
  closeMeetings = async () => {},
  identityConflict = (...args) => require("./identityPhotoService").legalConflict(...args),
  contactGuard = (...args) => require("./contactPolicyService").enforce(...args)
}) {
  const transaction = async fn => {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  const operation = async (actor, action, id) => audit({
    actorId: actor.id,
    action: "PROTECTION_" + action,
    targetType: "protection_property",
    targetId: id
  });
  const caseOperation = (actor, action, d) => audit({
    actorId: actor.id,
    action: 'PROTECTION_' + action,
    targetType: 'dispute',
    targetId: d.id
  });
  const inArea = (actor, p) => actor.user_type === "super_admin" || (actor.user_type === "zonal_admin" ? zoneContainsState(actor.assigned_zone, p.state_name) : (statesMatch(actor.assigned_state, p.state_name) || Number(actor.assigned_state_id) === Number(p.state_id)) && (!["admin", "lga_admin"].includes(actor.user_type) || String(actor.assigned_lga_name || actor.assigned_city || actor.assigned_lga || "").trim().toLowerCase() === String(p.lga_name).toLowerCase()));
  const manage = (actor, p) => OPS.has(actor.user_type) && inArea(actor, p) && Number(actor.id) !== Number(p.owner_id);
  const internalProfessional = async (actor, c = db) => PRO.has(actor.user_type) && actor.identity_verified === true && (actor.user_type !== "lawyer" || Boolean((await c.query("SELECT 1 FROM platform_lawyers WHERE lawyer_user_id=$1 AND is_active=TRUE", [actor.id])).rows.length));
  const workArea = (actor, p) => ["super_admin", "super_support_admin"].includes(actor.user_type) || PRO.has(actor.user_type) && lawyerTerritoryMatches(actor.assigned_state, actor.assigned_zone, p.state_name) || actor.user_type === "zonal_admin" && zoneContainsState(actor.assigned_zone, p.state_name) || (statesMatch(actor.assigned_state, p.state_name) || Number(actor.assigned_state_id) === Number(p.state_id)) && (!["admin", "lga_admin", "lga_support_admin", "agent"].includes(actor.user_type) || actor.user_type === "agent" && !String(actor.assigned_lga_name || actor.assigned_city || actor.assigned_lga || "").trim() || String(actor.assigned_lga_name || actor.assigned_city || actor.assigned_lga || "").trim().toLowerCase() === String(p.lga_name).toLowerCase());
  const setStatus = async (id, status, c = db) => c.query("UPDATE protection_properties SET verification_status=CASE WHEN EXISTS(SELECT 1 FROM disputes d WHERE d.protection_property_id=$1 AND (d.status NOT IN ('closed','resolved') OR d.protection_outcome IS DISTINCT FROM 'resolved_between_parties')) THEN 'disputed' ELSE $2::text END,updated_at=NOW() WHERE id=$1", [id, status]);
  const notifyOperations = async (p, event, title, message, key) => {
    const staff = (await db.query("SELECT * FROM users WHERE is_active=TRUE AND deleted_at IS NULL AND account_suspended_at IS NULL AND user_type IN ('super_admin','state_admin','admin','lga_admin','zonal_admin')")).rows;
    for (const person of staff) if (manage(person, p)) await notify(person.id, event, title, message, "/property-protection?property=" + p.id, key);
  };
  const raw = async (id, c = db, lock = false) => {
    const row = (await c.query("SELECT p.*,s.state_name,officer.full_name AS case_officer_name FROM protection_properties p JOIN states s ON s.id=p.state_id LEFT JOIN users officer ON officer.id=p.case_officer_id WHERE p.id=$1" + (lock ? " FOR UPDATE OF p" : ""), [id])).rows[0];
    if (!row) fail(404, "Property record not found.");
    return row;
  };
  const representative = async (actor, id, c = db) => (await c.query("SELECT * FROM protection_representatives WHERE property_id=$1 AND user_id=$2 AND status='approved' AND expires_at>NOW()", [id, actor.id])).rows[0];
  const assigned = async (actor, id, c = db) => Boolean((await c.query("SELECT 1 FROM protection_checks WHERE property_id=$1 AND assigned_to=$2 UNION ALL SELECT 1 FROM property_inspection_requests WHERE protection_property_id=$1 AND assigned_agent_id=$2 UNION ALL SELECT 1 FROM disputes d WHERE d.protection_property_id=$1 AND (d.responsible_support_id=$2 OR EXISTS(SELECT 1 FROM protection_case_participants m WHERE m.dispute_id=d.id AND m.user_id=$2 AND m.capacity IN ('professional','officer') AND m.revoked_at IS NULL)) AND NOT EXISTS(SELECT 1 FROM protection_case_participants r WHERE r.dispute_id=d.id AND r.user_id=$2 AND r.revoked_at IS NOT NULL) LIMIT 1", [id, actor.id])).rows.length);
  const access = async (actor, id, {
    write = false,
    officer = false
  } = {}, c = db) => {
    const p = await raw(id, c);
    const eligible = OPS.has(actor.user_type) || ["super_support_admin", "state_support_admin", "lga_support_admin"].includes(actor.user_type) || actor.user_type === "agent" && actor.identity_verified === true && Boolean((await c.query("SELECT 1 FROM platform_agents WHERE agent_user_id=$1 AND is_active=TRUE", [actor.id])).rows.length) || (await internalProfessional(actor, c));
    const owner = Number(p.owner_id) === Number(actor.id),
      rep = await representative(actor, id, c),
      manager = manage(actor, p) && !rep,
      worker = eligible && workArea(actor, p) && ((await assigned(actor, id, c)) || Number(p.case_officer_id) === Number(actor.id));
    if (officer && (await c.query('SELECT 1 FROM disputes WHERE protection_property_id=$1 AND (opened_by=$2 OR against_user=$2) LIMIT 1', [id, actor.id])).rows.length) fail(403, 'Another independent supervisor must review a matter in which you are a party.');
    if (officer && !manager) fail(403, "A different authorised supervisor in this area must review this action.");
    if (!owner && !rep && !manager && !worker) fail(404, "Property record not found.");
    if (write && !owner && !manager && !rep?.can_upload) fail(403, "Your authority does not permit this change.");
    return {
      p,
      owner,
      rep,
      manager,
      worker
    };
  };
  const caseAccess = async (actor, id, c = db) => {
    const d = (await c.query("SELECT d.*,p.owner_id AS record_owner_id,s.state_name AS protection_state FROM disputes d JOIN protection_properties p ON p.id=d.protection_property_id JOIN states s ON s.id=p.state_id WHERE d.id=$1", [id])).rows[0];
    if (!d) return null;
    const member = (await c.query("SELECT capacity,revoked_at FROM protection_case_participants WHERE dispute_id=$1 AND user_id=$2", [id, actor.id])).rows[0];
    if (member?.revoked_at && actor.user_type !== "super_admin" && Number(d.record_owner_id) !== Number(actor.id)) fail(403, "Your access to this case has been revoked.");
    if (Number(d.opened_by) === Number(actor.id) && Number(d.record_owner_id) !== Number(actor.id) && !(await representative(actor, d.protection_property_id, c))) fail(403, "Representative authority is no longer active.");
    if (member?.capacity === "professional" && (!(await internalProfessional(actor, c)) || !lawyerTerritoryMatches(actor.assigned_state, actor.assigned_zone, d.protection_state))) fail(403, "Professional case authority is no longer active.");
    if (Number(d.responsible_support_id) === Number(actor.id) && !OPS.has(actor.user_type) && !["super_support_admin", "state_support_admin", "lga_support_admin"].includes(actor.user_type)) fail(403, "Case officer authority is no longer active.");
    if (member?.capacity === "officer" && !["super_admin", "super_support_admin", "state_support_admin", "lga_support_admin"].includes(actor.user_type)) fail(403, "Case officer authority is no longer active.");
    if (member?.capacity === "representative" && Number(d.record_owner_id) !== Number(actor.id) && !(await representative(actor, d.protection_property_id, c))) fail(403, "Representative authority is no longer active.");
    if (Number(d.opened_by) !== Number(actor.id) && Number(d.against_user) !== Number(actor.id) && Number(d.responsible_support_id) !== Number(actor.id) && !member && actor.user_type !== "super_admin") fail(403, "You are not an authorised participant in this property case.");
    return {
      ...d,
      capacity: member?.capacity,
      professional: member?.capacity === "professional" && (await internalProfessional(actor, c))
    };
  };
  const requireCaseManager = async (actor, d) => {
    if ([d.opened_by, d.against_user].filter(Boolean).map(Number).includes(Number(actor.id))) fail(403, 'Another independent case officer must manage a matter in which you are a party.');
    const p = await raw(d.protection_property_id);
    if (!manage(actor, p) && !(Number(d.responsible_support_id) === Number(actor.id) && ["super_support_admin", "state_support_admin", "lga_support_admin"].includes(actor.user_type) && workArea(actor, p) && Number(actor.id) !== Number(p.owner_id) && !(await representative(actor, p.id)))) fail(403, "Only an independent authorised case officer may manage this case.");
    if (!manage(actor, p)) await caseAccess(actor, d.id);
    return p;
  };
  const canReadDocuments = async (actor, a) => {
    if (a.owner || a.rep || a.manager) return true;
    if (!a.worker) return false;
    if (Number(a.p.case_officer_id) === Number(actor.id)) return true;
    return Boolean((await db.query("SELECT 1 FROM protection_checks WHERE property_id=$1 AND assigned_to=$2 AND stage IN ('documents','consistency','registry','professional','final') UNION ALL SELECT 1 FROM disputes d WHERE d.protection_property_id=$1 AND (d.responsible_support_id=$2 OR EXISTS(SELECT 1 FROM protection_case_participants m WHERE m.dispute_id=d.id AND m.user_id=$2 AND m.capacity IN ('professional','officer') AND m.revoked_at IS NULL)) AND NOT EXISTS(SELECT 1 FROM protection_case_participants r WHERE r.dispute_id=d.id AND r.user_id=$2 AND r.revoked_at IS NOT NULL) LIMIT 1", [a.p.id, actor.id])).rows.length);
  };
  const caseRecipients = async id => {
    const users = (await db.query("SELECT u.* FROM users u WHERE u.is_active=TRUE AND u.deleted_at IS NULL AND u.account_suspended_at IS NULL AND (u.id IN (SELECT opened_by FROM disputes WHERE id=$1 UNION SELECT against_user FROM disputes WHERE id=$1 UNION SELECT responsible_support_id FROM disputes WHERE id=$1 UNION SELECT p.owner_id FROM disputes d JOIN protection_properties p ON p.id=d.protection_property_id WHERE d.id=$1) OR EXISTS(SELECT 1 FROM protection_case_participants m WHERE m.dispute_id=$1 AND m.user_id=u.id AND m.revoked_at IS NULL))", [id])).rows;
    const allowed = [];
    for (const u of users) {
      try {
        if (await caseAccess(u, id)) allowed.push(u.id);
      } catch {}
    }
    return allowed;
  };
  const duplicates = async (p, c = db) => {
    const rows = (await c.query(`SELECT id FROM protection_properties WHERE id<>$1 AND owner_id<>$2 AND state_id=$3 AND lower(lga_name)=lower($4) AND ((NULLIF(regexp_replace(lower(parcel_number),'[^a-z0-9]','','g'),'') IS NOT NULL AND regexp_replace(lower(parcel_number),'[^a-z0-9]','','g')=regexp_replace(lower($5),'[^a-z0-9]','','g')) OR (NULLIF(regexp_replace(lower(survey_number),'[^a-z0-9]','','g'),'') IS NOT NULL AND regexp_replace(lower(survey_number),'[^a-z0-9]','','g')=regexp_replace(lower($6),'[^a-z0-9]','','g')) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND ABS(latitude-$7::numeric)<0.00015 AND ABS(longitude-$8::numeric)<0.00015 AND lower(trim(address))=lower(trim($9)))) LIMIT 30`, [p.id, p.owner_id, p.state_id, p.lga_name, p.parcel_number, p.survey_number, p.latitude, p.longitude, p.address])).rows;
    const listings = (await c.query("SELECT id FROM properties WHERE landlord_id<>$1 AND state_id=$2 AND lower(trim(full_address))=lower(trim($3)) LIMIT 20", [p.owner_id, p.state_id, p.address])).rows;
    for (const [prefix, matches] of [["record", rows], ["listing", listings]]) for (const match of matches) await c.query("INSERT INTO protection_alerts(property_id,category,rule_key,summary,source_details) VALUES($1,'amana_platform',$2,'A possible matching property record needs investigation. A match is not proof of fraud.',$3) ON CONFLICT DO NOTHING", [p.id, prefix + ":" + match.id, JSON.stringify({
      matched_type: prefix,
      matched_id: match.id
    })]);
  };
  const create = async (actor, body) => {
    if (!uuid(body.submission_id)) fail(400, "A registration retry identifier is required.");
    const p = propertyInput(body),
      location = await locations({
        stateId: p.state_id,
        lgaName: p.lga_name,
        requireLga: true
      });
    p.lga_name = location.lga_name;
    const result = await transaction(async c => {
      await c.query("SELECT pg_advisory_xact_lock($1,$2)", [2049, actor.id]);
      const old = (await c.query("SELECT * FROM protection_properties WHERE owner_id=$1 AND submission_id=$2", [actor.id, body.submission_id])).rows[0];
      if (old) return old;
      if (body.listing_id) {
        const listing = (await c.query("SELECT id FROM properties WHERE id=$1 AND landlord_id=$2", [Number(body.listing_id), actor.id])).rows[0];
        if (!listing) fail(403, "Only your own listing can be linked.");
      }
      const columns = Object.keys(p);
      const values = columns.map(k => k === "ownership_details" ? JSON.stringify(p[k]) : p[k]);
      const row = (await c.query("INSERT INTO protection_properties(owner_id,submission_id,listing_id," + columns.join(",") + ") VALUES($1,$2,$3," + values.map((_, i) => "$" + (i + 4)).join(",") + ") RETURNING *", [actor.id, body.submission_id, Number(body.listing_id) || null, ...values])).rows[0];
      for (const stage of STAGES) await c.query("INSERT INTO protection_checks(property_id,stage) VALUES($1,$2) ON CONFLICT DO NOTHING", [row.id, stage]);
      await duplicates(row, c);
      return row;
    });
    await operation(actor, "REGISTERED", result.id);
    await notifyOperations({
      ...result,
      state_name: (await raw(result.id)).state_name
    }, "property_protection", "New private property record", "A property record needs its first review and work assignment.", "pp:new:" + result.id);
    await notify(actor.id, "property_protection", "Property record registered", "Your private property record is saved. Registration is not proof of ownership.", "/property-protection?property=" + result.id, "pp:registered:" + result.id);
    return result;
  };
  const list = async (actor, view = "owner", before) => {
    const args = [actor.id],
      bind = value => {
        args.push(value);
        return "$" + args.length;
      };
    let where = "(p.owner_id=$1 OR EXISTS(SELECT 1 FROM protection_representatives r WHERE r.property_id=p.id AND r.user_id=$1 AND r.status='approved' AND r.expires_at>NOW()))";
    if (view === "assigned") {
      if (!OPS.has(actor.user_type) && !["super_support_admin", "state_support_admin", "lga_support_admin"].includes(actor.user_type) && !((PRO.has(actor.user_type) || actor.user_type === "agent") && actor.identity_verified === true)) fail(403, "Current assigned-work authority is required.");
      where = "(p.case_officer_id=$1 OR EXISTS(SELECT 1 FROM protection_checks c WHERE c.property_id=p.id AND c.assigned_to=$1) OR EXISTS(SELECT 1 FROM property_inspection_requests i WHERE i.protection_property_id=p.id AND i.assigned_agent_id=$1) OR EXISTS(SELECT 1 FROM disputes d WHERE d.protection_property_id=p.id AND (d.responsible_support_id=$1 OR EXISTS(SELECT 1 FROM protection_case_participants m WHERE m.dispute_id=d.id AND m.user_id=$1 AND m.capacity IN ('professional','officer') AND m.revoked_at IS NULL))))";
    }
    if (view === "operations") {
      if (!OPS.has(actor.user_type)) fail(403, "Operations access required.");
      where = "p.owner_id<>$1";
      if (actor.user_type === "zonal_admin") {
        const {
          ZONE_STATES,
          canonicalZone
        } = require("../config/utils/territorialZones");
        where += " AND s.state_name=ANY(" + bind(ZONE_STATES[canonicalZone(actor.assigned_zone)] || []) + "::text[])";
      } else if (actor.user_type !== "super_admin") {
        where += " AND (lower(s.state_name)=lower(" + bind(actor.assigned_state || "") + "::text) OR p.state_id=" + bind(Number(actor.assigned_state_id) || 0) + "::integer)";
        if (["admin", "lga_admin"].includes(actor.user_type)) where += " AND lower(p.lga_name)=lower(" + bind(actor.assigned_lga_name || actor.assigned_city || actor.assigned_lga || "") + "::text)";
      }
    }
    if (before !== undefined && before !== "") {
      if (!/^\d{1,15}$/.test(String(before))) fail(400, "Invalid property page reference.");
      where += " AND p.id<" + bind(before) + "::bigint";
    }
    const rows = (await db.query("SELECT p.*,s.state_name FROM protection_properties p JOIN states s ON s.id=p.state_id WHERE " + where + " ORDER BY p.id DESC LIMIT 200", args)).rows;
    const allowed = [];
    for (const p of rows) {
      if (view === "operations" && !manage(actor, p)) continue;
      if (view === "assigned") {
        try {
          await access(actor, p.id);
        } catch {
          continue;
        }
      }
      allowed.push({
        id: p.id,
        title: p.title,
        state_name: p.state_name,
        lga_name: p.lga_name,
        ownership_capacity: p.ownership_capacity,
        verification_status: p.verification_status,
        created_at: p.created_at
      });
    }
    return allowed;
  };
  const details = async (actor, id) => {
    const a = await access(actor, id),
      p = a.p,
      confidential = !a.owner && !a.rep && (await internalProfessional(actor));
    const checks = (await db.query("SELECT c.*,assigned.full_name AS assigned_name,reviewer.full_name AS reviewed_by_name FROM protection_checks c LEFT JOIN users assigned ON assigned.id=c.assigned_to LEFT JOIN users reviewer ON reviewer.id=c.reviewed_by WHERE c.property_id=$1 ORDER BY c.id", [id])).rows.map(c => {
      const visible = confidential && Number(c.assigned_to) === Number(actor.id) && c.stage === "professional";
      return {
        ...c,
        private_findings: visible ? c.private_findings : undefined,
        history: (c.history || []).map(h => ({
          ...h,
          private_findings: visible ? h.private_findings : undefined
        }))
      };
    });
    const docs = (await db.query("SELECT id,inspection_id,uploaded_by,kind,original_name,mime_type,file_size,sha256,scan_status,retain_until,created_at,withdrawn_at FROM protection_documents WHERE property_id=$1 ORDER BY created_at DESC", [id])).rows;
    const canVault = await canReadDocuments(actor, a);
    const alerts = (await db.query("SELECT * FROM protection_alerts WHERE property_id=$1 ORDER BY created_at DESC", [id])).rows.map(r => ({
      ...r,
      source_details: a.manager ? r.source_details : undefined
    }));
    const cases = (await db.query("SELECT id,title,status,protection_outcome,created_at,responsible_support_id FROM disputes WHERE protection_property_id=$1 ORDER BY id DESC", [id])).rows;
    const allowedCases = [];
    for (const d of cases) {
      try {
        await caseAccess(actor, d.id);
        allowedCases.push(d);
      } catch {
        if (a.manager) allowedCases.push({
          ...d,
          assignment_required: true
        });
      }
    }
    const inspections = (await db.query("SELECT id,status,assigned_agent_id,scheduled_at,started_at,completed_at,inspection_summary,inspection_findings,supervisor_note FROM property_inspection_requests WHERE protection_property_id=$1 ORDER BY id DESC", [id])).rows;
    const representatives = a.owner || a.manager ? (await db.query("SELECT r.*,u.full_name FROM protection_representatives r JOIN users u ON u.id=r.user_id WHERE r.property_id=$1", [id])).rows : [];
    await operation(actor, 'RECORD_VIEWED', id);
    const operations = a.manager ? (await db.query("SELECT l.id,l.action,l.created_at,u.full_name AS actor_name,u.user_type AS actor_role FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.target_type='protection_property' AND l.target_id=$1 AND l.action LIKE 'PROTECTION_%' AND l.action<>'PROTECTION_RECORD_VIEWED' ORDER BY l.id DESC LIMIT 100", [id])).rows : [];
    return {
      operations,
      property: {
        ...p,
        pending_update: canVault ? p.pending_update : undefined,
        record_history: canVault ? p.record_history : undefined,
        ownership_details: canVault ? p.ownership_details : undefined,
        seller_details: canVault ? p.seller_details : undefined
      },
      permissions: {
        owner: a.owner,
        representative: Boolean(a.rep),
        can_upload: Boolean(a.owner || a.manager || a.rep?.can_upload || a.worker),
        can_open_cases: Boolean(a.owner || a.rep?.can_open_cases),
        can_request_services: Boolean(a.owner || a.rep?.can_request_services),
        operations: a.manager,
        case_operations: Boolean(a.worker && !a.owner && !a.rep && ["super_support_admin", "state_support_admin", "lga_support_admin"].includes(actor.user_type) && allowedCases.some(d => Number(d.responsible_support_id) === Number(actor.id))),
        worker: a.worker,
        documents: Boolean(canVault),
        professional: PRO.has(actor.user_type)
      },
      checks,
      documents: docs.filter(d => canVault || Number(d.uploaded_by) === Number(actor.id)),
      alerts,
      cases: allowedCases,
      inspections,
      representatives,
      monitoring: (await db.query("SELECT * FROM protection_monitoring WHERE property_id=$1", [id])).rows[0] || null,
      requests: a.owner || a.rep || a.manager ? (await db.query("SELECT id,user_id,service_code,scope_snapshot,amount,currency,status,created_at,paid_at FROM protection_service_requests WHERE property_id=$1 ORDER BY created_at DESC", [id])).rows : []
    };
  };
  const requestCorrection = async (actor, id, body) => {
    const a = await access(actor, id);
    if (!a.owner) fail(403, "Only the record holder can request a record correction.");
    if (text(body.reason).length < 15) fail(400, "Explain why this record needs correction. Ownership cannot be transferred through this form.");
    const next = propertyInput(body);
    const location = await locations({
      stateId: next.state_id,
      lgaName: next.lga_name,
      requireLga: true
    });
    next.lga_name = location.lga_name;
    await db.query("UPDATE protection_properties SET pending_update=$2,update_requested_by=$3,update_reason=$4,updated_at=NOW() WHERE id=$1", [id, JSON.stringify(next), actor.id, text(body.reason)]);
    await operation(actor, "RECORD_CORRECTION_REQUESTED", id);
    return {
      success: true
    };
  };
  const reviewCorrection = async (actor, id, body) => transaction(async c => {
    const a = await access(actor, id, {
        officer: true
      }, c),
      locked = await raw(id, c, true);
    if (!locked.pending_update) fail(409, "There is no correction waiting for review.");
    if (!["approved", "rejected"].includes(body.status) || text(body.reason).length < 15) fail(400, "Record your decision and its supporting reason.");
    if (body.status === "approved") {
      if (!(await c.query("SELECT 1 FROM users WHERE id=$1 AND identity_verified=TRUE", [locked.owner_id])).rows.length) fail(409, "The record holder must complete identity verification first.");
      if (!(await c.query("SELECT 1 FROM protection_documents WHERE property_id=$1 AND withdrawn_at IS NULL AND retain_until>NOW() AND scan_status='clean'", [id])).rows.length) fail(409, "Review current supporting authority and ownership evidence first.");
      const next = propertyInput(locked.pending_update);
      if (next.state_id !== Number(locked.state_id) || next.lga_name !== locked.lga_name || next.address !== locked.address) {
        if ((await c.query("SELECT 1 FROM protection_service_requests WHERE property_id=$1 AND status IN ('pending_payment','paid','in_progress') UNION ALL SELECT 1 FROM disputes WHERE protection_property_id=$1 AND status NOT IN ('closed','resolved') UNION ALL SELECT 1 FROM protection_monitoring WHERE property_id=$1 AND active_until>NOW() AND cancelled_at IS NULL LIMIT 1", [id])).rows.length) fail(409, "Finish or resolve active services, monitoring and cases before moving this record to another location.");
      }
      const state = (await c.query("SELECT state_name FROM states WHERE id=$1", [next.state_id])).rows[0];
      if (!state || !manage(actor, {
        ...locked,
        ...next,
        state_name: state.state_name
      })) fail(403, "A supervisor authorised for both locations must approve this correction.");
      await c.query("UPDATE protection_properties SET record_history=record_history||jsonb_build_array(jsonb_build_object('record',to_jsonb(protection_properties)-'record_history'-'pending_update','reviewed_by',$2::int,'reason',$3::text,'reviewed_at',NOW())) WHERE id=$1", [id, actor.id, text(body.reason)]);
      const columns = Object.keys(next);
      await c.query("UPDATE protection_properties SET " + columns.map((k, i) => k + "=$" + (i + 2)).join(",") + ",pending_update=NULL,verification_status='under_review',verified_at=NULL,verified_until=NULL,case_officer_id=NULL,updated_at=NOW() WHERE id=$1", [id, ...columns.map(k => k === "ownership_details" ? JSON.stringify(next[k]) : next[k])]);
      await c.query("UPDATE protection_checks SET history=history||jsonb_build_array(to_jsonb(protection_checks)-'history'),status='pending',assigned_to=NULL,private_findings=NULL,public_summary=NULL,source_details='{}',document_ids='[]',submitted_by=NULL,reviewed_by=NULL,updated_at=NOW() WHERE property_id=$1", [id]);
    } else await c.query("UPDATE protection_properties SET pending_update=NULL,updated_at=NOW() WHERE id=$1", [id]);
    if(body.status==="approved")await setStatus(id,"under_review",c);await operation(actor, "RECORD_CORRECTION_" + body.status.toUpperCase(), id);
    return {
      success: true
    };
  });
  const representatives = async (actor, id, body) => {
    const a = await access(actor, id);
    if (!a.owner) fail(403, "Only the record holder can request a representative.");
    const target = Number(body.user_id),
      expires = new Date(body.expires_at);
    if (!Number.isSafeInteger(target) || target <= 0 || target === Number(actor.id) || text(body.authority_description).length < 15 || !Number.isFinite(expires.getTime()) || expires <= new Date()) fail(400, "Choose another registered person, explain their authority and set an expiry date.");
    const user = (await db.query("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND is_active=TRUE", [target])).rows[0];
    if (!user) fail(400, "The representative account is unavailable.");
    await db.query("INSERT INTO protection_representatives(property_id,user_id,capacity,authority_description,can_upload,can_open_cases,can_request_services,requested_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(property_id,user_id) DO UPDATE SET status='pending',reviewed_by=NULL,review_note=NULL,capacity=EXCLUDED.capacity,authority_description=EXCLUDED.authority_description,can_upload=EXCLUDED.can_upload,can_open_cases=EXCLUDED.can_open_cases,can_request_services=EXCLUDED.can_request_services,requested_by=EXCLUDED.requested_by,expires_at=EXCLUDED.expires_at", [id, target, text(body.capacity, 100), text(body.authority_description), body.can_upload === true, body.can_open_cases === true, body.can_request_services === true, actor.id, expires]);
    await operation(actor, "REPRESENTATIVE_REQUESTED", id);
    return {
      success: true
    };
  };
  const reviewRepresentative = async (actor, id, body) => {
    const a = await access(actor, id);
    if (!a.manager && !(a.owner && body.status === "revoked")) fail(403, "Only an independent supervisor can approve authority. The record holder may revoke it.");
    const grant = (await db.query("SELECT * FROM protection_representatives WHERE property_id=$1 AND user_id=$2", [id, Number(body.user_id)])).rows[0];
    if (!grant || Number(grant.user_id) === Number(actor.id)) fail(403, "Another authorised supervisor must review this authority.");
    if (!["approved", "rejected", "revoked"].includes(body.status) || text(body.reason).length < 15) fail(400, "Choose an authority decision and record the evidence-based reason.");
    if (body.status === "approved" && !(await db.query("SELECT 1 FROM protection_documents WHERE property_id=$1 AND withdrawn_at IS NULL", [id])).rows.length) fail(409, "Authority evidence must be uploaded and checked before approval.");
    await db.query("UPDATE protection_representatives SET status=$3,reviewed_by=$4,review_note=$5 WHERE property_id=$1 AND user_id=$2", [id, grant.user_id, body.status, actor.id, text(body.reason)]);
    if (body.status === "revoked") {
      const cases = (await db.query("SELECT id FROM disputes WHERE protection_property_id=$1", [id])).rows;
      for (const item of cases) {
        await db.query("UPDATE protection_case_participants SET revoked_at=NOW() WHERE dispute_id=$1 AND user_id=$2", [item.id, grant.user_id]);
        await closeMeetings(item.id, grant.user_id);
      }
    }
    await operation(actor, "REPRESENTATIVE_" + body.status.toUpperCase(), id);
    await notify(grant.user_id, "property_protection", "Property representative update", "Your property authority request was reviewed. Open Property Protection.", "/property-protection", `pp:rep:${id}:${grant.user_id}:${body.status}`);
    return {
      success: true
    };
  };
  const staff = async (actor, id) => {
    const a = await access(actor, id, {
      officer: true
    });
    const rows = (await db.query("SELECT u.id,u.full_name,u.user_type,u.identity_verified,u.assigned_state,u.assigned_zone,u.assigned_state_id,u.assigned_lga_name,EXISTS(SELECT 1 FROM platform_agents pa WHERE pa.agent_user_id=u.id AND pa.is_active=TRUE) AS platform_agent,EXISTS(SELECT 1 FROM platform_lawyers pl WHERE pl.lawyer_user_id=u.id AND pl.is_active=TRUE) AS platform_professional FROM users u WHERE u.is_active=TRUE AND u.deleted_at IS NULL AND u.account_suspended_at IS NULL AND u.user_type IN ('agent','lawyer','state_lawyer','zonal_lawyer','super_lawyer','super_admin','state_admin','admin','lga_admin','zonal_admin','super_support_admin','state_support_admin','lga_support_admin')")).rows;
    return rows.filter(u => Number(u.id) !== Number(a.p.owner_id) && (u.user_type !== "lawyer" || u.platform_professional) && (u.user_type === "super_admin" || Number(u.assigned_state_id) === Number(a.p.state_id) || statesMatch(u.assigned_state, a.p.state_name) || lawyerTerritoryMatches(u.assigned_state, u.assigned_zone, a.p.state_name))).map(u => ({
      id: u.id,
      full_name: u.full_name,
      user_type: u.user_type,
      identity_verified: u.identity_verified,
      platform_agent: u.platform_agent
    }));
  };
  const assign = async (actor, id, body) => {
    const a = await access(actor, id, {
        officer: true
      }),
      target = Number(body.assigned_to),
      stage = body.stage;
    if (!STAGES.includes(stage) && stage !== "case_officer") fail(400, "Choose an existing work stage.");
    const user = (await db.query("SELECT u.*,EXISTS(SELECT 1 FROM platform_agents pa WHERE pa.agent_user_id=u.id AND pa.is_active=TRUE) AS platform_agent,EXISTS(SELECT 1 FROM platform_lawyers pl WHERE pl.lawyer_user_id=u.id AND pl.is_active=TRUE) AS platform_professional FROM users u WHERE u.id=$1 AND u.is_active=TRUE AND u.deleted_at IS NULL AND u.account_suspended_at IS NULL", [target])).rows[0];
    if (!user || target === Number(a.p.owner_id) || (await db.query("SELECT 1 FROM protection_representatives WHERE property_id=$1 AND user_id=$2 AND status IN ('pending','approved')", [id, target])).rows.length) fail(403, "Choose an independent authorised reviewer.");
    const parties = (await db.query('SELECT opened_by,against_user FROM disputes WHERE protection_property_id=$1', [id])).rows.flatMap(row => [row.opened_by, row.against_user]).filter(Boolean);
    if (parties.map(Number).includes(target)) fail(403, 'A case participant cannot be the independent reviewer for the same property.');
    const territory = user.user_type === "super_admin" || statesMatch(user.assigned_state, a.p.state_name) || Number(user.assigned_state_id) === Number(a.p.state_id) || lawyerTerritoryMatches(user.assigned_state, user.assigned_zone, a.p.state_name);
    if (!territory) fail(403, "The assigned person must be authorised for this location.");
    if (stage === "professional" && (await identityConflict(target, [...new Set([a.p.owner_id, ...parties])]))) fail(403, "A reviewer cannot assess their own identity or property interest.");
    if (stage === "professional" && !(await internalProfessional(user))) fail(403, "An identity-verified professional must perform title review.");
    if (["inspection", "survey"].includes(stage) && !(user.user_type === "agent" && user.platform_agent && user.identity_verified === true) && !OPS.has(user.user_type)) fail(403, "Choose an approved platform field agent or authorised supervisor.");
    if (!["inspection", "survey", "professional"].includes(stage) && !OPS.has(user.user_type) && !["super_support_admin", "state_support_admin", "lga_support_admin"].includes(user.user_type)) fail(403, "Choose an authorised case officer.");
    if (stage === "case_officer") await db.query("UPDATE protection_properties SET case_officer_id=$2,updated_at=NOW() WHERE id=$1", [id, target]);else {
      if (policy.SERVICE_STAGES && Object.values(policy.SERVICE_STAGES).includes(stage) && !(await db.query("SELECT 1 FROM protection_service_requests WHERE property_id=$1 AND service_code=$2 AND status IN ('paid','in_progress')", [id, Object.entries(policy.SERVICE_STAGES).find(([, v]) => v === stage)[0]])).rows.length) fail(409, "A defined service must be requested and its payment confirmed first.");
      await db.query("UPDATE protection_checks SET history=history||jsonb_build_array(to_jsonb(protection_checks)-'history') WHERE property_id=$1 AND stage=$2", [id, stage]);
      await db.query("UPDATE protection_checks SET assigned_to=$3,status='assigned',updated_at=NOW() WHERE property_id=$1 AND stage=$2", [id, stage, target]);
      await setStatus(id, stage === "registry" ? "registry_search_pending" : stage === "inspection" ? "inspection_pending" : stage === "professional" ? "professional_review_pending" : "under_review", db);
      if (stage === "inspection") await db.query("UPDATE property_inspection_requests SET assigned_agent_id=$2,status='assigned',updated_at=NOW() WHERE protection_property_id=$1 AND protection_purpose='verification' AND status='paid'", [id, target]);
    }
    await operation(actor, "WORK_ASSIGNED_" + stage.toUpperCase(), id);
    await notify(target, "property_protection", "Property task assigned", "A property protection task needs your attention.", "/property-protection?view=assigned", `pp:task:${id}:${stage}:${target}`);
    return {
      success: true
    };
  };
  const submitCheck = async (actor, id, stage, body) => {
    const a = await access(actor, id),
      check = (await db.query("SELECT * FROM protection_checks WHERE property_id=$1 AND stage=$2", [id, stage])).rows[0];
    if (stage === "inspection") fail(409, "Use the assigned inspection report workflow for this stage.");
    if (!check || Number(check.assigned_to) !== Number(actor.id) || a.owner || a.rep) fail(403, "Only the independent assigned reviewer can submit this stage.");
    if (stage === "professional" && !(await internalProfessional(actor))) fail(403, "Verified professional review is required.");
    if (["approved", "rejected"].includes(check.status) || stage === "final") fail(409, "This stage needs a supervisor decision or a new assignment.");
    await db.query("UPDATE protection_checks SET history=history||jsonb_build_array(to_jsonb(protection_checks)-'history') WHERE property_id=$1 AND stage=$2", [id, stage]);
    const summary = text(body.summary);
    if (summary.length < 15) fail(400, "Record clear findings and limitations.");
    const source = sourceInput(body.source_details, stage),
      ids = Array.isArray(body.document_ids) ? [...new Set(body.document_ids.map(String))] : [];
    if (["registry", "survey", "professional"].includes(stage) && !ids.length) fail(400, "Attach the relevant checked report or source evidence.");
    if (ids.length) {
      const docs = (await db.query("SELECT id FROM protection_documents WHERE property_id=$1 AND id=ANY($2::uuid[]) AND withdrawn_at IS NULL AND retain_until>NOW()", [id, ids])).rows;
      if (docs.length !== ids.length) fail(400, "Evidence must belong to this property and remain available.");
    }
    await db.query("UPDATE protection_checks SET status='submitted',public_summary=$3,private_findings=$4,source_details=$5,document_ids=$6,submitted_by=$7,submitted_at=NOW(),updated_at=NOW() WHERE property_id=$1 AND stage=$2", [id, stage, summary, stage === "professional" ? text(body.private_findings, 10000) : null, JSON.stringify(source), JSON.stringify(ids), actor.id]);
    await setStatus(id, "under_review", db);
    await operation(actor, "CHECK_SUBMITTED_" + stage.toUpperCase(), id);
    return {
      success: true
    };
  };
  const reviewCheck = async (actor, id, stage, body) => transaction(async c => {
    const a = await access(actor, id, {
        officer: true
      }, c),
      check = (await c.query("SELECT * FROM protection_checks WHERE property_id=$1 AND stage=$2 FOR UPDATE", [id, stage])).rows[0];
    if (!check || !["approved", "returned", "rejected"].includes(body.status) || text(body.reason).length < 15) fail(400, "Choose a stage decision and record your reason.");
    if (Number(check.submitted_by) === Number(actor.id)) fail(403, "Another supervisor must review your own submission.");
    if (body.status === "approved" && stage !== "documents" && stage !== "final" && check.status !== "submitted") fail(409, "The assigned reviewer must submit this stage first.");
    if (stage === "inspection" && body.status === "approved" && (check.source_details?.attendance !== "attended" || !check.document_ids?.length)) fail(409, "A physical inspection must include actual attendance and its evidence.");
    if (stage === "documents" && body.status === "approved" && !(await c.query("SELECT 1 FROM protection_documents WHERE property_id=$1 AND withdrawn_at IS NULL AND retain_until>NOW()", [id])).rows.length) fail(409, "Upload supporting ownership evidence first. No single document type is mandatory.");
    await c.query("UPDATE protection_checks SET history=history||jsonb_build_array(to_jsonb(protection_checks)-'history') WHERE property_id=$1 AND stage=$2", [id, stage]);
    if (stage === "final" && body.status === "approved") {
      if (!(await c.query("SELECT 1 FROM users WHERE id=$1 AND identity_verified=TRUE AND is_active=TRUE AND deleted_at IS NULL", [a.p.owner_id])).rows.length) fail(409, "The record holder must complete identity verification before final property verification.");
      const checks = (await c.query("SELECT stage,status FROM protection_checks WHERE property_id=$1", [id])).rows;
      const until = finalDecision(checks, body);
      if ((await c.query("SELECT 1 FROM protection_alerts WHERE property_id=$1 AND status<>'closed' UNION ALL SELECT 1 FROM disputes WHERE protection_property_id=$1 AND (status NOT IN ('closed','resolved') OR protection_outcome IS DISTINCT FROM 'resolved_between_parties') LIMIT 1", [id])).rows.length) fail(409, "Open alerts and cases must be reviewed before a final verification decision.");
      if ((await c.query("SELECT 1 FROM protection_documents WHERE property_id=$1 AND withdrawn_at IS NULL AND retain_until<$2", [id, until])).rows.length) fail(409, "The supporting documents must be retained through the verification review date.");
      await c.query("UPDATE protection_checks SET source_details=$2,public_summary=$3 WHERE property_id=$1 AND stage='final'", [id, JSON.stringify({
        scope: text(body.scope),
        limitations: text(body.limitations),
        valid_until: until.toISOString(),
        checked_at: new Date().toISOString(),
        reviewer_id: actor.id
      }), text(body.scope)]);
      await c.query("UPDATE protection_properties SET verification_status='verified_within_scope',verification_scope=$2,verification_limitations=$3,verified_at=NOW(),verified_until=$4,updated_at=NOW() WHERE id=$1", [id, text(body.scope), text(body.limitations), until]);
    } else await setStatus(id, body.status === "rejected" ? "rejected" : body.status === "returned" ? "verification_incomplete" : stage === "registry" ? "registry_search_completed" : stage === "documents" ? "documents_received" : "under_review", c);
    await c.query("UPDATE protection_checks SET status=$3,reviewed_by=$4,review_reason=$5,reviewed_at=NOW(),updated_at=NOW() WHERE property_id=$1 AND stage=$2", [id, stage, body.status, actor.id, text(body.reason)]);
    const service = Object.entries(policy.SERVICE_STAGES).find(([, v]) => v === stage)?.[0];
    if (service && body.status === "approved") await c.query("UPDATE protection_service_requests SET status='completed',completed_at=NOW() WHERE property_id=$1 AND service_code=$2 AND status IN ('paid','in_progress')", [id, service]);
    await operation(actor, "CHECK_" + body.status.toUpperCase() + "_" + stage.toUpperCase(), id);
    await notify(a.p.owner_id, "property_protection", "Property verification update", "A verification stage has been reviewed. Read its findings, requirements and limitations.", "/property-protection?property=" + id, `pp:check:${id}:${stage}:${check.updated_at}:${body.status}`);
    return {
      success: true
    };
  });
  const openCase = async (actor, id, body) => {
    const a = await access(actor, id);
    if (!a.owner && !a.rep?.can_open_cases) fail(403, "Only the record holder or an approved case representative can report a case.");
    if (!uuid(body.request_id) || text(body.title, 255).length < 5 || text(body.description, 10000).length < 15) fail(400, "Enter a case title, details and retry identifier.");
    await contactGuard({
      userId: actor.id,
      channel: "dispute",
      contextKey: "protection:" + id,
      texts: [body.title, body.description]
    });
    const d = await transaction(async c => {
      await c.query("SELECT pg_advisory_xact_lock($1,$2)", [2050, actor.id]);
      const old = (await c.query("SELECT * FROM disputes WHERE opened_by=$1 AND protection_request_key=$2", [actor.id, body.request_id])).rows[0];
      if (old) return old;
      const row = (await c.query("INSERT INTO disputes(property_id,protection_property_id,opened_by,against_user,title,description,priority,responsible_support_id,protection_request_key) VALUES($1,$2,$3,NULL,$4,$5,'normal',$6,$7) RETURNING *", [a.p.listing_id, id, actor.id, text(body.title, 255), text(body.description, 10000), a.p.case_officer_id, body.request_id])).rows[0];
      if (!a.owner) await c.query("INSERT INTO protection_case_participants(dispute_id,user_id,capacity,approved_by) VALUES($1,$2,'representative',$3)", [row.id, a.p.owner_id, actor.id]);
      await c.query("UPDATE protection_checks SET history=history||jsonb_build_array(to_jsonb(protection_checks)-'history'),status='pending',public_summary=NULL,source_details='{}',updated_at=NOW() WHERE property_id=$1 AND stage='final' AND status<>'pending'", [id]);
      await c.query("UPDATE protection_properties SET verification_status='disputed',updated_at=NOW() WHERE id=$1", [id]);
      return row;
    });
    await operation(actor, "CASE_OPENED", id);
    await caseOperation(actor, "CASE_OPENED", d);
    await notifyOperations(a.p, "property_protection", "Property case needs assignment", "A private property case needs its named support officer.", "pp:casequeue:" + d.id);
    await notify(a.p.owner_id, "dispute", "Property case opened", "Your property case is ready. Use the existing case conversation for messages and shared evidence.", "/dispute/" + d.id, `pp:case:${d.id}`);
    if (a.p.case_officer_id) await notify(a.p.case_officer_id, "dispute", "Property case needs review", "A property case was opened for your assigned record.", "/dispute/" + d.id, `pp:case:${d.id}`);
    return d;
  };
  const participants = async (actor, caseId, body) => {
    const d = (await db.query("SELECT d.*,p.owner_id AS record_owner_id FROM disputes d JOIN protection_properties p ON p.id=d.protection_property_id WHERE d.id=$1", [caseId])).rows[0];
    if (!d) fail(404, "Property case not found.");
    await requireCaseManager(actor, d);
    if (body.revoked === true) {
      if (text(body.authority_reason).length < 15) fail(400, "Explain why case access is removed.");
      if (Number(body.user_id) === Number(d.record_owner_id)) fail(403, "The record holder cannot be removed through participant access.");
      await db.query("UPDATE protection_case_participants SET revoked_at=NOW() WHERE dispute_id=$1 AND user_id=$2", [caseId, Number(body.user_id)]);
      await closeMeetings(caseId, Number(body.user_id));
      await operation(actor, "CASE_PARTICIPANT_REVOKED", d.protection_property_id);
      await caseOperation(actor, "CASE_PARTICIPANT_REVOKED", d);
      return {
        success: true
      };
    }
    if (!["representative", "respondent", "officer", "professional"].includes(body.capacity) || text(body.authority_reason).length < 15) fail(400, "State the participant capacity and verified authority.");
    const target = (await db.query("SELECT * FROM users WHERE id=$1 AND is_active=TRUE AND deleted_at IS NULL", [Number(body.user_id)])).rows[0];
    if (!target) fail(400, "Choose an active platform account.");
    if (body.capacity === "professional" && (await identityConflict(target.id, [d.record_owner_id, d.opened_by, d.against_user].filter(Boolean)))) fail(403, "Choose an independent professional who is not a party to this matter.");
    if (body.capacity === "professional" && !(await internalProfessional(target))) fail(403, "Choose an identity-verified assigned professional.");
    if (body.capacity === "officer" && !workArea(target, await raw(d.protection_property_id))) fail(403, "Choose a case officer authorised for this location.");
    if (body.capacity === "officer" && !["super_admin", "super_support_admin", "state_support_admin", "lga_support_admin"].includes(target.user_type)) fail(403, "Choose an authorised support officer.");
    if (body.capacity === "representative" && !(await representative(target, d.protection_property_id))) fail(403, "Representative authority must be approved first.");
    await db.query("INSERT INTO protection_case_participants(dispute_id,user_id,capacity,approved_by) VALUES($1,$2,$3,$4) ON CONFLICT(dispute_id,user_id) DO UPDATE SET capacity=EXCLUDED.capacity,approved_by=EXCLUDED.approved_by,revoked_at=NULL", [caseId, target.id, body.capacity, actor.id]);
    if (body.capacity === "respondent") await db.query("UPDATE disputes SET against_user=$2 WHERE id=$1", [caseId, target.id]);
    if (body.capacity === "officer") await db.query("UPDATE disputes SET responsible_support_id=$2 WHERE id=$1", [caseId, target.id]);
    await operation(actor, "CASE_PARTICIPANT_APPROVED", d.protection_property_id);
    await caseOperation(actor, "CASE_PARTICIPANT_APPROVED", d);
    await notify(target.id, "dispute", "Property case access granted", "A supervisor has added you to a property case. Read only the shared case records.", "/dispute/" + caseId, `pp:participant:${caseId}:${target.id}`);
    return {
      success: true
    };
  };
  const outcome = async (actor, caseId, body) => {
    const d = await caseAccess(actor, caseId);
    if (!d) fail(404, "Property case not found.");
    await requireCaseManager(actor, d);
    if (d.is_legally_sealed) fail(409, "This case record is sealed.");
    if (!OUTCOMES.includes(body.outcome) || text(body.summary).length < 20 || text(body.limitations).length < 10) fail(400, "Choose the outcome and describe the result and its limits.");
    if (body.outcome === 'reopened_with_new_evidence') {
      if (!['closed', 'resolved'].includes(d.status) || !d.resolved_at) fail(409, 'Only a closed case with new shared evidence may be reopened.');
      if (!(await db.query("SELECT 1 FROM dispute_evidence e JOIN disputes d ON d.id=e.dispute_id WHERE d.id=$1 AND COALESCE(e.created_at,e.uploaded_at)>d.resolved_at AND e.file_hash ~ '^[a-f0-9]{64}$' LIMIT 1", [caseId])).rows.length) fail(409, 'Upload the new case evidence before reopening this case.');
    }
    const status = body.outcome === "reopened_with_new_evidence" ? "open" : ["evidence_for_review", "awaiting_official_information", "escalated"].includes(body.outcome) ? "in_progress" : body.outcome === "resolved_between_parties" ? "resolved" : "closed";
    await db.query("UPDATE disputes SET status=$2::text,protection_outcome=$3::text,resolution=$4::text,outcome_limitations=$5::text,resolved_by=$6,protection_outcome_history=protection_outcome_history||jsonb_build_array(jsonb_build_object('outcome',$3::text,'summary',$4::text,'limitations',$5::text,'recorded_by',$6::int,'recorded_at',NOW())),resolved_at=CASE WHEN $2::text IN ('resolved','closed') THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1", [caseId, status, body.outcome, text(body.summary), text(body.limitations), actor.id]);
    await setStatus(d.protection_property_id, "verification_incomplete");
    await operation(actor, "CASE_OUTCOME_RECORDED", d.protection_property_id);
    await caseOperation(actor, "CASE_OUTCOME_RECORDED", d);
    if (["resolved", "closed"].includes(status)) await closeMeetings(caseId);
    const users = await caseRecipients(caseId);
    for (const userId of users) await notify(userId, "dispute", "Property case outcome recorded", "Read the recorded outcome and its limits. A case status is not an official title decision.", "/dispute/" + caseId, `pp:outcome:${caseId}:${body.outcome}:${Date.now()}`);
    return {
      success: true
    };
  };
  const meeting = async (actorId, targetId, caseId) => {
    const users = (await db.query("SELECT * FROM users WHERE id=ANY($1::int[]) AND deleted_at IS NULL AND is_active=TRUE AND account_suspended_at IS NULL", [[Number(actorId), Number(targetId)]])).rows;
    if (users.length !== 2) fail(403, "Both meeting participants must be active authorised accounts.");
    let d;
    for (const user of users) d = await caseAccess(user, caseId);
    if (!d || d.is_legally_sealed || ["closed", "resolved"].includes(d.status)) fail(403, "The case is not open for a meeting.");
    return d;
  };
  const alert = async (actor, id, body) => {
    await access(actor, id, {
      officer: true
    });
    if (!["independent_finding", "official_information"].includes(body.category) || text(body.summary).length < 20) fail(400, "Choose a finding category and record the observation.");
    const source = sourceInput(body.source_details, body.category === "official_information" ? "registry" : "observation");
    const ids = Array.isArray(body.document_ids) ? body.document_ids : [];
    if (!ids.length || !(await db.query("SELECT 1 FROM protection_documents WHERE property_id=$1 AND id=ANY($2::uuid[]) AND scan_status='clean' AND withdrawn_at IS NULL", [id, ids])).rows.length) fail(400, "Attach the source evidence for this finding.");
    if (body.category === "official_information" && !(await db.query("SELECT 1 FROM protection_checks WHERE property_id=$1 AND stage='registry' AND status='approved' AND document_ids ?| $2::text[]", [id, ids])).rows.length) fail(409, "Official information must be backed by evidence from an approved registry search.");
    const row = (await db.query("INSERT INTO protection_alerts(property_id,category,rule_key,summary,source_details,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [id, body.category, "manual:" + crypto.randomUUID(), text(body.summary), JSON.stringify({
      ...source,
      document_ids: ids
    }), actor.id])).rows[0];
    await operation(actor, "FINDING_RECORDED", id);
    return row;
  };
  const reviewAlert = async (actor, id, alertId, body) => {
    await access(actor, id, {
      officer: true
    });
    if (!["reviewing", "closed"].includes(body.status) || text(body.reason).length < 15) fail(400, "Record the investigation decision and reason.");
    await db.query("UPDATE protection_alerts SET status=$3,review_note=$4,reviewed_by=$5,updated_at=NOW() WHERE id=$1 AND property_id=$2", [alertId, id, body.status, text(body.reason), actor.id]);
    await operation(actor, "ALERT_REVIEWED", id);
    return {
      success: true
    };
  };
  return {
    create,
    list,
    details,
    caseRecipients,
    notifyOperations,
    canReadDocuments,
    requestCorrection,
    reviewCorrection,
    access,
    raw,
    manage,
    inArea,
    assigned,
    representative,
    representatives,
    reviewRepresentative,
    staff,
    assign,
    submitCheck,
    reviewCheck,
    openCase,
    caseAccess,
    participants,
    outcome,
    meeting,
    alert,
    reviewAlert,
    duplicates,
    operation,
    transaction,
    setStatus
  };
}
let instance;
const getService = () => instance || (instance = createService({
  db: require("../config/middleware/database"),
  notify: (...a) => require("../config/utils/notificationService").createNotification(...a),
  audit: require("../config/utils/auditLogger").logAction,
  closeMeetings: (...args) => require("./callStateBridge").endCaseCalls(...args),
  locations: require("../config/utils/locationDirectory").resolveLocationSelection,
  pricing: require("../config/utils/locationPricing").getLocationPricingQuote
}));
module.exports = {
  createService,
  ...Object.fromEntries(["create", "list", "details", "caseRecipients", "requestCorrection", "reviewCorrection", "access", "raw", "representatives", "reviewRepresentative", "staff", "assign", "submitCheck", "reviewCheck", "openCase", "caseAccess", "participants", "outcome", "meeting", "alert", "reviewAlert"].map(k => [k, (...args) => getService()[k](...args)])),
  getService
};

const field = (name, label, type = "text", options, required = true) => ({
  name,
  label,
  type,
  options,
  required,
});
const choices = (values) =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
const stages = [
  "documents",
  "consistency",
  "registry",
  "survey",
  "inspection",
  "professional",
  "final",
];
const decision = [
  field(
    "status",
    "Decision",
    "select",
    choices(["approved", "returned", "rejected"]),
  ),
  field("reason", "Reason", "textarea"),
];
const report = [
  field("summary", "Findings and limitations", "textarea"),
  field("document_ids", "Supporting evidence", "documents", null, false),
];
const source = [
  "source",
  "office",
  "state",
  "reference",
  "search_date",
  "result",
  "limitations",
  "qualification_reference",
].map((name) =>
  field(
    "source_details." + name,
    name.replaceAll("_", " "),
    name === "search_date" ? "date" : "text",
    null,
    false,
  ),
);
module.exports = {
  register: {
    title: "Register a property — free",
    fields: [
      field("title", "Property name"),
      field(
        "property_type",
        "Property type",
        "select",
        choices(["land", "house", "flat", "commercial", "other"]),
      ),
      field("state_id", "State", "state"),
      field("lga_name", "Local government area", "lga"),
      ...[
        "town",
        "area",
        "address",
        "parcel_number",
        "survey_number",
        "boundary_details",
        "seller_details",
      ].map((name) =>
        field(
          name,
          name.replaceAll("_", " "),
          ["address", "boundary_details", "seller_details"].includes(name)
            ? "textarea"
            : "text",
          null,
          name === "address",
        ),
      ),
      field("latitude", "Latitude", "number", null, false),
      field("longitude", "Longitude", "number", null, false),
      field(
        "acquisition_method",
        "How was it acquired?",
        "select",
        choices(["purchase", "inheritance", "allocation", "transfer", "other"]),
      ),
      field(
        "ownership_capacity",
        "Ownership capacity",
        "select",
        choices(["individual", "family", "joint", "company"]),
      ),
      ...["name", "members", "authority", "registration_number"].map((name) =>
        field(
          "ownership_details." + name,
          "Family/company " + name.replaceAll("_", " "),
          "textarea",
          null,
          false,
        ),
      ),
    ],
  },
  representative: {
    title: "Request representative access",
    fields: [
      field("user_id", "Representative account number", "number"),
      field("capacity", "Relationship or capacity"),
      field(
        "authority_description",
        "Authority and supporting evidence",
        "textarea",
      ),
      field("expires_at", "Authority expiry", "date"),
      field("can_upload", "May upload documents", "checkbox", null, false),
      field("can_open_cases", "May report cases", "checkbox", null, false),
      field(
        "can_request_services",
        "May request paid services",
        "checkbox",
        null,
        false,
      ),
    ],
  },
  representativeReview: {
    title: "Review representative authority",
    fields: [
      field("user_id", "Representative account number", "number"),
      field(
        "status",
        "Decision",
        "select",
        choices(["approved", "rejected", "revoked"]),
      ),
      field("reason", "Evidence-based reason", "textarea"),
    ],
  },
  assignOfficer: {
    title: "Assign case officer",
    fields: [field("assigned_to", "Assigned officer", "staff")],
  },
  assignCheck: {
    title: "Assign verification work",
    fields: [
      field("stage", "Stage", "select", choices(stages)),
      field("assigned_to", "Assigned person", "staff"),
    ],
  },
  submitCheck: {
    title: "Submit verification findings",
    fields: [
      field(
        "stage",
        "Stage",
        "select",
        choices(stages.filter((x) => !["inspection", "final"].includes(x))),
      ),
      ...report,
      ...source,
      field(
        "private_findings",
        "Confidential professional findings",
        "textarea",
        null,
        false,
      ),
    ],
  },
  reviewCheck: {
    title: "Review verification stage",
    fields: [
      field("stage", "Stage", "select", choices(stages)),
      ...decision,
      field("scope", "Final verification scope", "textarea", null, false),
      field(
        "limitations",
        "Final verification limitations",
        "textarea",
        null,
        false,
      ),
      field("valid_until", "Final review/expiry date", "date", null, false),
    ],
  },
  document: {
    title: "Add private evidence",
    fields: [
      field(
        "kind",
        "Evidence type",
        "select",
        choices([
          "certificate",
          "deed",
          "survey",
          "allocation",
          "receipt",
          "inheritance",
          "transfer",
          "authority",
          "registry_report",
          "inspection",
          "surveyor_report",
          "other",
        ]),
      ),
      field(
        "inspection_id",
        "Inspection number (inspection evidence only)",
        "number",
        null,
        false,
      ),
      field("retain_until", "Retain until", "date"),
      field(
        "retention_consent",
        "I agree to store this evidence until the chosen date for property checks and case review.",
        "checkbox",
      ),
      field("file", "PDF, photo or video (up to 25 MB)", "file"),
    ],
  },
  retention: {
    title: "Extend document retention",
    fields: [
      field("document_id", "Evidence", "document"),
      field("retain_until", "New retention date", "date"),
    ],
  },
  reportCase: {
    title: "Report a property case — free",
    fields: [
      field("title", "Case title"),
      field("description", "What happened?", "textarea"),
    ],
  },
  addFinding: {
    title: "Record a supported finding",
    fields: [
      field(
        "category",
        "Finding category",
        "select",
        choices(["independent_finding", "official_information"]),
      ),
      ...report,
      ...source,
    ],
  },
  reviewFinding: {
    title: "Review an alert",
    fields: [
      field("alert_id", "Alert", "alert"),
      field("status", "Decision", "select", choices(["reviewing", "closed"])),
      field("reason", "Investigation and reason", "textarea"),
    ],
  },
  taskAssign: {
    title: "Assign field inspection",
    fields: [
      field("task_id", "Inspection", "task"),
      field("agent_id", "Approved field agent", "staff"),
    ],
  },
  taskSchedule: {
    title: "Schedule inspection",
    fields: [
      field("task_id", "Inspection", "task"),
      field("scheduled_at", "Inspection date and time", "datetime-local"),
    ],
  },
  taskStart: {
    title: "Start assigned inspection",
    fields: [field("task_id", "Inspection", "task")],
  },
  taskSubmit: {
    title: "Submit inspection report",
    fields: [
      field("task_id", "Inspection", "task"),
      field(
        "attendance",
        "Attendance",
        "select",
        choices(["attended", "unable_to_access"]),
      ),
      ...report,
      ...["conditions", "occupants", "discrepancies"].map((name) =>
        field(name, name, "textarea", null, false),
      ),
      field(
        "location_permission",
        "Location sharing was permitted",
        "checkbox",
        null,
        false,
      ),
      field("latitude", "Observed latitude", "number", null, false),
      field("longitude", "Observed longitude", "number", null, false),
      field("accuracy", "Location accuracy (metres)", "number", null, false),
    ],
  },
  taskReview: {
    title: "Review field inspection",
    fields: [
      field("task_id", "Inspection", "task"),
      field(
        "decision",
        "Decision",
        "select",
        choices(["approved", "returned"]),
      ),
      field("reason", "Reason", "textarea"),
    ],
  },
  configureService: {
    title: "Define a paid service",
    fields: [
      field(
        "code",
        "Service",
        "select",
        choices([
          "registry",
          "survey",
          "inspection",
          "professional",
          "monitoring",
        ]),
      ),
      field("description", "Exactly what this service includes", "textarea"),
      field("enabled", "Service enabled", "checkbox", null, false),
      field(
        "available_states",
        "Available states (leave empty for all)",
        "states",
        null,
        false,
      ),
      field("period_days", "Monitoring period in days", "number", null, false),
      field(
        "cadence_days",
        "Days between monitoring visits",
        "number",
        null,
        false,
      ),
    ],
  },
  participant: {
    title: "Approve case participant",
    fields: [
      field("case_id", "Case", "case"),
      field("user_id", "Participant account number", "number"),
      field(
        "capacity",
        "Capacity",
        "select",
        choices(["representative", "respondent", "officer", "professional"]),
      ),
      field("authority_reason", "Checked authority", "textarea"),
    ],
  },
  outcome: {
    title: "Record case outcome",
    fields: [
      field("case_id", "Case", "case"),
      field(
        "outcome",
        "Outcome",
        "select",
        choices([
          "resolved_between_parties",
          "evidence_for_review",
          "awaiting_official_information",
          "escalated",
          "referred_by_user",
          "closed_without_resolution",
          "reopened_with_new_evidence",
        ]),
      ),
      field("summary", "Outcome and supporting reasons", "textarea"),
      field("limitations", "What this result does not establish", "textarea"),
    ],
  },
};

module.exports.requestCorrection = {
  title: "Request a record correction",
  fields: [
    ...module.exports.register.fields,
    field("reason", "Reason and supporting authority", "textarea"),
  ],
};
module.exports.reviewCorrection = {
  title: "Review record correction",
  fields: [
    field("status", "Decision", "select", choices(["approved", "rejected"])),
    field("reason", "Checked authority and reason", "textarea"),
  ],
};

module.exports.participant.fields.push(
  field(
    "revoked",
    "Remove this participant’s case access",
    "checkbox",
    null,
    false,
  ),
);

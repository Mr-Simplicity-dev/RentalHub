const OPS = new Set([
  "super_admin",
  "state_admin",
  "admin",
  "lga_admin",
  "zonal_admin",
]);
const PRO = new Set(["lawyer", "state_lawyer", "zonal_lawyer", "super_lawyer"]);
const STAGES = [
  "documents",
  "consistency",
  "registry",
  "survey",
  "inspection",
  "professional",
  "final",
];
const OUTCOMES = [
  "resolved_between_parties",
  "evidence_for_review",
  "awaiting_official_information",
  "escalated",
  "referred_by_user",
  "closed_without_resolution",
  "reopened_with_new_evidence",
];
const SERVICE_STAGES = {
  registry: "registry",
  survey: "survey",
  inspection: "inspection",
  professional: "professional",
};
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const text = (value, max = 3000) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
function propertyInput(body) {
  const result = {};
  for (const [key, max] of Object.entries({
    title: 200,
    property_type: 50,
    lga_name: 120,
    town: 120,
    area: 160,
    address: 4000,
    parcel_number: 150,
    survey_number: 150,
    boundary_details: 4000,
    seller_details: 3000,
  }))
    result[key] = text(body[key], max) || null;
  if (
    !result.title ||
    !result.property_type ||
    !result.lga_name ||
    !result.address
  )
    fail(400, "Enter the property type, title, state, LGA and address.");
  result.state_id = Number(body.state_id);
  if (!Number.isSafeInteger(result.state_id) || result.state_id <= 0)
    fail(400, "Choose a valid state.");
  if (
    !["purchase", "inheritance", "allocation", "transfer", "other"].includes(
      body.acquisition_method,
    )
  )
    fail(400, "Choose how the property was acquired.");
  if (
    !["individual", "family", "joint", "company"].includes(
      body.ownership_capacity,
    )
  )
    fail(400, "Choose individual, family, joint or company capacity.");
  result.acquisition_method = body.acquisition_method;
  result.ownership_capacity = body.ownership_capacity;
  result.ownership_details = {
    name: text(body.ownership_details?.name, 250),
    members: text(body.ownership_details?.members, 3000),
    authority: text(body.ownership_details?.authority, 3000),
    registration_number: text(body.ownership_details?.registration_number, 150),
  };
  if (
    result.ownership_capacity !== "individual" &&
    (!result.ownership_details.name || !result.ownership_details.authority)
  )
    fail(400, "Enter the family/company name and your authority to act.");
  for (const [key, limit] of [
    ["latitude", 90],
    ["longitude", 180],
  ]) {
    result[key] =
      body[key] === null || body[key] === "" || body[key] === undefined
        ? null
        : Number(body[key]);
    if (
      result[key] !== null &&
      (!Number.isFinite(result[key]) || Math.abs(result[key]) > limit)
    )
      fail(400, "Enter valid coordinates.");
  }
  if ((result.latitude === null) !== (result.longitude === null))
    fail(400, "Provide both coordinates or leave both empty.");
  return result;
}
function sourceInput(body, stage) {
  const data = {};
  for (const k of [
    "source",
    "office",
    "state",
    "reference",
    "search_date",
    "result",
    "limitations",
    "qualification_reference",
    "inspection_date",
    "latitude",
    "longitude",
    "attendance",
    "conditions",
    "discrepancies",
  ])
    data[k] = text(
      body?.[k],
      k === "result" || k === "limitations" ? 4000 : 1000,
    );
  if (
    stage === "registry" &&
    [
      "source",
      "office",
      "state",
      "reference",
      "search_date",
      "result",
      "limitations",
    ].some((k) => !data[k])
  )
    fail(
      400,
      "Record the registry, office/state, reference, search date, result and limitations.",
    );
  if (
    stage === "registry" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(data.search_date) ||
      !Number.isFinite(Date.parse(data.search_date)) ||
      Date.parse(data.search_date) > Date.now() ||
      new Date(data.search_date).toISOString().slice(0, 10) !==
        data.search_date)
  )
    fail(400, "Enter the actual registry search date.");
  if (stage === "survey" && !data.qualification_reference)
    fail(
      400,
      "Record the survey reviewer qualification or report authority reference.",
    );
  return data;
}
function finalDecision(checks, body) {
  if (
    STAGES.slice(0, -1).some(
      (stage) =>
        !checks.some((c) => c.stage === stage && c.status === "approved"),
    )
  )
    fail(409, "Every required verification stage must be approved first.");
  if (text(body.scope).length < 15 || text(body.limitations).length < 10)
    fail(400, "State the verification scope and its limitations.");
  const until = new Date(body.valid_until);
  if (!Number.isFinite(until.getTime()) || until.getTime() <= Date.now())
    fail(400, "Set a future verification review/expiry date.");
  return until;
}
module.exports = {
  OPS,
  PRO,
  STAGES,
  OUTCOMES,
  SERVICE_STAGES,
  fail,
  text,
  uuid,
  propertyInput,
  sourceInput,
  finalDecision,
};

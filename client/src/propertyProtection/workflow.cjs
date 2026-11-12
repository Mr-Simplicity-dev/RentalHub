const labels = (value) => String(value || "").replaceAll("_", " ");
const get = (object, key) =>
  key.split(".").reduce((value, part) => value?.[part], object);
function put(object, key, value) {
  const parts = key.split(".");
  let target = object;
  for (const part of parts.slice(0, -1))
    target = target[part] || (target[part] = {});
  target[parts.at(-1)] = value;
}
function bodyFor(values) {
  const body = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === "" || value === undefined) continue;
    put(body, key, value);
  }
  return body;
}
function actionSpec(action, id, values, key) {
  const body = bodyFor(values),
    root = "/property-protection",
    property = root + "/" + id;
  let url,
    method = "post";
  const stage = encodeURIComponent(body.stage || ""),
    task = encodeURIComponent(body.task_id || ""),
    caseId = encodeURIComponent(body.case_id || "");
  switch (action) {
    case "register":
      url = root;
      body.submission_id = key;
      break;
    case "requestCorrection":
      url = property + "/corrections";
      break;
    case "reviewCorrection":
      url = property + "/corrections";
      method = "patch";
      break;
    case "representative":
      url = property + "/representatives";
      break;
    case "representativeReview":
      url = property + "/representatives";
      method = "patch";
      break;
    case "assignOfficer":
      url = property + "/assign-officer";
      break;
    case "assignCheck":
      url = property + "/checks/" + stage + "/assign";
      break;
    case "submitCheck":
      url = property + "/checks/" + stage + "/submit";
      break;
    case "reviewCheck":
      url = property + "/checks/" + stage + "/review";
      method = "patch";
      break;
    case "document":
      url = property + "/documents";
      break;
    case "retention":
      url =
        root +
        "/documents/" +
        encodeURIComponent(body.document_id) +
        "/retention";
      method = "patch";
      break;
    case "reportCase":
      url = property + "/cases";
      body.request_id = key;
      break;
    case "addFinding":
      url = property + "/alerts";
      break;
    case "reviewFinding":
      url = property + "/alerts/" + encodeURIComponent(body.alert_id);
      method = "patch";
      break;
    case "participant":
      url = root + "/cases/" + caseId + "/participants";
      break;
    case "outcome":
      url = root + "/cases/" + caseId + "/outcome";
      method = "patch";
      break;
    case "configureService":
      url = root + "/configuration/" + encodeURIComponent(body.code);
      method = "put";
      body.available_states = Array.isArray(body.available_states)
        ? body.available_states
        : String(body.available_states || "")
            .split(",")
            .filter((x) => x.trim())
            .map(Number);
      break;
    default:
      if (!/^task(Assign|Schedule|Start|Submit|Review)$/.test(action))
        throw Error("Unsupported property action");
      url = root + "/tasks/" + task + "/action";
      body.action = action.slice(4).toLowerCase();
  }
  return { url, method, body };
}
function fieldOptions(field, values, data, locations, staff) {
  const map = (items, key, label) =>
    items.map((item) => ({
      value: item[key],
      label: typeof label === "function" ? label(item) : item[label],
    }));
  switch (field.type) {
    case "states":
    case "state":
      return map(locations, "id", "state_name");
    case "lga":
      return (
        locations.find((x) => String(x.id) === String(values.state_id))?.lgas ||
        []
      ).map((x) => ({
        value: typeof x === "string" ? x : x.lga_name || x.name,
        label: typeof x === "string" ? x : x.lga_name || x.name,
      }));
    case "staff":
      return map(staff, "id", (x) => x.full_name + " — " + labels(x.user_type));
    case "document":
    case "documents":
      return map(data?.documents || [], "id", "original_name");
    case "task":
      return map(
        data?.inspections || [],
        "id",
        (x) => "#" + x.id + " — " + labels(x.status),
      );
    case "case":
      return map(data?.cases || [], "id", "title");
    case "alert":
      return map(
        data?.alerts || [],
        "id",
        (x) => labels(x.category) + " — " + x.summary,
      );
    default:
      return field.options || [];
  }
}
function actionsFor(data, user) {
  if (!data)
    return [
      "register",
      ...(user?.user_type === "super_admin" ? ["configureService"] : []),
    ];
  const p = data.permissions;
  return [
    ...(p.owner
      ? [
          "requestCorrection",
          "representative",
          "representativeReview",
          "retention",
        ]
      : []),
    ...(p.owner || p.can_open_cases ? ["reportCase"] : []),
    ...(p.owner || p.can_upload ? ["document"] : []),
    ...(p.operations
      ? [
          ...(data.property?.pending_update ? ["reviewCorrection"] : []),
          "assignOfficer",
          "assignCheck",
          "reviewCheck",
          "representativeReview",
          "addFinding",
          "reviewFinding",
          "taskAssign",
          "taskReview",
          "participant",
          "outcome",
        ]
      : []),
    ...(p.case_operations ? ["participant", "outcome"] : []),
    ...(p.worker
      ? ["submitCheck", "taskSchedule", "taskStart", "taskSubmit"]
      : []),
    ...(p.operations ? ["taskSchedule"] : []),
  ].filter((x, i, a) => a.indexOf(x) === i);
}
const valuesFor = (form, data) =>
  Object.fromEntries(
    (form?.fields || []).map((f) => [
      f.name,
      get(data?.property, f.name) ?? "",
    ]),
  );
function viewsFor(user) {
  const role = user?.user_type,
    operations = [
      "super_admin",
      "state_admin",
      "admin",
      "lga_admin",
      "zonal_admin",
    ];
  return [
    "owner",
    ...([
      ...operations,
      "agent",
      "lawyer",
      "state_lawyer",
      "zonal_lawyer",
      "super_lawyer",
      "super_support_admin",
      "state_support_admin",
      "lga_support_admin",
    ].includes(role)
      ? ["assigned"]
      : []),
    ...(operations.includes(role) ? ["operations"] : []),
  ];
}
module.exports = {
  viewsFor,
  labels,
  get,
  bodyFor,
  valuesFor,
  actionSpec,
  fieldOptions,
  actionsFor,
};

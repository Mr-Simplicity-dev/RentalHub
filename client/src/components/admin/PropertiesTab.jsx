import React, { useState } from "react";

const PropertiesTab = ({
  properties,
  selectedProps,
  setSelectedProps,
  bulkProps,
  unlistProperty,
  toggleFeatured,
}) => {
  const [propertyAction, setPropertyAction] = useState({
    open: false,
    property: null,
    action: "",
    reason: "",
    error: "",
  });

  const toggleProperty = (id) => {
    setSelectedProps((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id]
    );
  };

  const toggleAll = (checked) => {
    if (checked) {
      setSelectedProps(properties.map((p) => p.id));
    } else {
      setSelectedProps([]);
    }
  };

  const openPropertyAction = (property, action) => {
    setPropertyAction({
      open: true,
      property,
      action,
      reason: "",
      error: "",
    });
  };

  const closePropertyAction = () => {
    setPropertyAction({
      open: false,
      property: null,
      action: "",
      reason: "",
      error: "",
    });
  };

  const getActionTitle = () => {
    if (propertyAction.action === "bulk_unlist") return "Unlist selected properties";
    if (propertyAction.action === "unlist") return "Unlist property";
    if (propertyAction.action === "feature") return "Feature property";
    return "Unfeature property";
  };

  const getActionReasonLabel = () => {
    if (propertyAction.action === "bulk_unlist") return "Bulk unlist reason";
    if (propertyAction.action === "unlist") return "Unlist reason";
    if (propertyAction.action === "feature") return "Feature reason";
    return "Unfeature reason";
  };

  const submitPropertyAction = async () => {
    const reason = propertyAction.reason.trim();

    if (!reason) {
      setPropertyAction((prev) => ({
        ...prev,
        error: `${getActionReasonLabel()} is required.`,
      }));
      return;
    }

    try {
      if (propertyAction.action === "bulk_unlist") {
        await bulkProps(reason);
        setSelectedProps([]);
      } else if (propertyAction.action === "unlist") {
        await unlistProperty(propertyAction.property.id, reason);
      } else if (propertyAction.action === "feature") {
        await toggleFeatured(propertyAction.property.id, true, reason);
      } else if (propertyAction.action === "unfeature") {
        await toggleFeatured(propertyAction.property.id, false, reason);
      }

      closePropertyAction();
    } catch (err) {
      setPropertyAction((prev) => ({
        ...prev,
        error: err.response?.data?.message || "Property action failed.",
      }));
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* BULK ACTION BAR */}

      {selectedProps.length > 0 && (
        <div className="flex items-center justify-between rounded-xl2 border border-soft bg-white px-4 py-3 shadow-card transition hover:shadow-cardHover">

          <span className="text-sm text-gray-600">
            {selectedProps.length} properties selected
          </span>

          <button
            onClick={() => openPropertyAction(null, "bulk_unlist")}
            className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white transition-colors hover:bg-red-700"
          >
            Unlist Selected
          </button>

        </div>
      )}

      {/* TABLE */}

      <div className="rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover overflow-x-auto">

        <table className="min-w-full text-sm">

          <thead className="bg-gray-50 text-gray-700">

            <tr>

              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>

              <th className="p-3 text-left">Property</th>
              <th className="p-3 text-left">Landlord</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-center w-40">Actions</th>

            </tr>

          </thead>

          <tbody>

            {properties.length === 0 && (
              <tr>
                <td
                  colSpan="5"
                  className="text-center py-10 text-gray-500"
                >
                  No properties found
                </td>
              </tr>
            )}

            {properties.map((p) => (

              <tr
                key={p.id}
                className="border-t border-soft hover:bg-gray-50 transition"
              >

                {/* CHECKBOX */}

                <td className="p-3">

                  <input
                    type="checkbox"
                    checked={selectedProps.includes(p.id)}
                    onChange={() => toggleProperty(p.id)}
                  />

                </td>

                {/* TITLE */}

                <td className="p-3 font-medium">
                  {p.title}
                </td>

                {/* LANDLORD */}

                <td className="p-3 text-gray-600">
                  {p.landlord_name}
                </td>

                {/* STATUS */}

                <td className="p-3">

                  <span
                    className={`px-2 py-1 text-xs rounded-full
                    ${
                      (p.is_available ?? p.is_active)
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {(p.is_available ?? p.is_active) ? "Active" : "Unlisted"}
                  </span>

                  {p.featured && (
                    <span className="ml-2 px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700">
                      Featured
                    </span>
                  )}

                </td>

                {/* ACTIONS */}

                <td className="p-3">

                  <div className="flex justify-center gap-2">

                    {(p.is_available ?? p.is_active) && (
                      <button
                        onClick={() => openPropertyAction(p, "unlist")}
                        className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700"
                      >
                        Unlist
                      </button>
                    )}

                    <button
                      onClick={() =>
                        openPropertyAction(
                          p,
                          p.featured ? "unfeature" : "feature"
                        )
                      }
                      className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                        p.featured
                          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          : "bg-amber-600 text-white hover:bg-amber-700"
                      }`}
                    >
                      {p.featured ? "Unfeature" : "Feature"}
                    </button>

                  </div>

                  {Array.isArray(p.operations) && p.operations.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                      {p.operations.slice(0, 2).map((operation) => (
                        <p
                          key={operation.id}
                          className="max-w-[190px] truncate"
                          title={operation.note || operation.event_type}
                        >
                          {String(operation.event_type || "").replace(/_/g, " ")} by{" "}
                          {operation.actor_name || "Super admin"}
                        </p>
                      ))}
                    </div>
                  )}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      {propertyAction.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl2 bg-white shadow-card">
            <div className="border-b border-soft px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {getActionTitle()}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {propertyAction.action === "bulk_unlist"
                  ? `${selectedProps.length} selected properties`
                  : propertyAction.property?.title}
              </p>
            </div>

            <div className="space-y-3 px-6 py-4">
              <label className="block text-sm font-medium text-gray-700">
                {getActionReasonLabel()}
              </label>
              <textarea
                value={propertyAction.reason}
                onChange={(event) =>
                  setPropertyAction((prev) => ({
                    ...prev,
                    reason: event.target.value,
                    error: "",
                  }))
                }
                rows={4}
                className="w-full rounded-lg border border-soft px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Explain why this property moderation action is needed"
              />
              <p className="text-xs text-gray-500">
                This reason is saved in property governance history.
              </p>

              {propertyAction.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {propertyAction.error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-soft px-6 py-4">
              <button
                type="button"
                onClick={closePropertyAction}
                className="rounded-lg border border-soft px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPropertyAction}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  propertyAction.action === "feature"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PropertiesTab;

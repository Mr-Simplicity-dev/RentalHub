import React from "react";

const PropertiesTab = ({
  properties,
  selectedProps,
  setSelectedProps,
  bulkProps,
  unlistProperty,
  toggleFeatured,
}) => {

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

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* BULK ACTION BAR */}

      {selectedProps.length > 0 && (
        <div className="flex items-center justify-between rounded-xl2 border border-soft bg-white px-4 py-3 shadow-card transition hover:shadow-cardHover">

          <span className="text-sm text-gray-600">
            {selectedProps.length} properties selected
          </span>

          <button
            onClick={bulkProps}
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
                        onClick={() => unlistProperty(p.id)}
                        className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700"
                      >
                        Unlist
                      </button>
                    )}

                    <button
                      onClick={() => toggleFeatured(p.id, !p.featured)}
                      className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                        p.featured
                          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          : "bg-amber-600 text-white hover:bg-amber-700"
                      }`}
                    >
                      {p.featured ? "Unfeature" : "Feature"}
                    </button>

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
};

export default PropertiesTab;

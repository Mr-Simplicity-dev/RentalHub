import React from "react";

const PropertiesTab = ({
  properties,
  selectedProps,
  setSelectedProps,
  bulkProps,
  unlistProperty
}) => {
  return (
    <div className="card overflow-x-auto">

      {selectedProps.length > 0 && (
        <div className="mb-3">
          <button
            onClick={bulkProps}
            className="btn btn-sm btn-danger"
          >
            Unlist Selected
          </button>
        </div>
      )}

      <table className="w-full text-sm">

        <thead>

          <tr className="border-b">

            <th>

              <input
                type="checkbox"
                onChange={(e) =>
                  setSelectedProps(
                    e.target.checked
                      ? properties.map((p) => p.id)
                      : []
                  )
                }
              />

            </th>

            <th>Title</th>
            <th>Landlord</th>
            <th>Status</th>
            <th>Actions</th>

          </tr>

        </thead>

        <tbody>

          {properties.map((p) => (

            <tr key={p.id} className="border-b">

              <td>

                <input
                  type="checkbox"
                  checked={selectedProps.includes(p.id)}
                  onChange={(e) =>
                    setSelectedProps((prev) =>
                      e.target.checked
                        ? [...prev, p.id]
                        : prev.filter((id) => id !== p.id)
                    )
                  }
                />

              </td>

              <td>{p.title}</td>

              <td>{p.landlord_name}</td>

              <td>
                {p.is_active ? "Active" : "Unlisted"}
              </td>

              <td>

                {p.is_active && (
                  <button
                    onClick={() => unlistProperty(p.id)}
                    className="btn btn-xs btn-danger"
                  >
                    Unlist
                  </button>
                )}

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
};

export default PropertiesTab;
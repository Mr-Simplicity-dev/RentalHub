import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import Loader from "../../components/common/Loader";
import { FaHome, FaSearch } from "react-icons/fa";

const PAGE_SIZE = 20;

const AdminProperties = () => {
  const navigate = useNavigate();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    total: 0,
    pages: 1,
  });

  const loadProperties = useCallback(async (p = 1, query = "") => {
    setLoading(true);

    try {
      const res = await api.get("/admin/properties", {
        params: {
          search: query,
          page: p,
          limit: PAGE_SIZE,
        },
      });

      if (res.data?.success) {
        setProperties(res.data.data || []);
        setPagination(res.data.pagination || { total: 0, pages: 1 });
      }
    } catch (err) {
      console.error("Failed to load properties:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);

    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    loadProperties(page, debouncedSearch);
  }, [page, debouncedSearch, loadProperties]);

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, pagination.total);

  if (loading && properties.length === 0) return <Loader fullScreen />;

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* HEADER */}

      <div className="flex flex-col items-center gap-4">

        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            Property Management
          </h1>

          <p className="text-sm text-gray-500">
            {pagination.total
              ? `Showing ${from}-${to} of ${pagination.total} properties`
              : "No properties available"}
          </p>
        </div>

        {/* SEARCH */}

        <div className="relative w-full md:w-80">

          <FaSearch className="absolute left-3 top-3 text-gray-400" />

          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search title, landlord, city..."
            className="w-full rounded-lg border border-soft bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

        </div>

      </div>


      {/* TABLE */}

      <div className="bg-white border border-soft rounded-xl2 shadow-card overflow-x-auto">

        <table className="min-w-full text-sm">

          <thead className="bg-gray-50 text-gray-600">

            <tr>

              <th className="py-3 px-4 text-left">Property</th>
              <th className="py-3 px-4 text-left">Owner</th>
              <th className="py-3 px-4 text-left">Location</th>
              <th className="py-3 px-4 text-left">Rent</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-left">Created</th>
              <th className="py-3 px-4 text-right">Action</th>

            </tr>

          </thead>

          <tbody>

            {properties.map((p) => (

              <tr
                key={p.id}
                className="border-t border-soft hover:bg-gray-50 transition"
              >

                <td className="py-3 px-4 font-medium flex items-center">

                  <FaHome className="mr-2 text-primary-600" />

                  {p.title}

                </td>

                <td className="py-3 px-4 text-gray-700">
                  {p.landlord_name || "—"}
                </td>

                <td className="py-3 px-4 text-gray-700">
                  {p.city || "—"}
                  {p.state ? `, ${p.state}` : ""}
                </td>

                <td className="py-3 px-4 font-medium">
                  ₦{Number(p.rent_amount || 0).toLocaleString()}
                </td>

                <td className="py-3 px-4">

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold
                        ${
                          p.is_available
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                    >
                      {p.is_available ? "available" : "unlisted"}
                    </span>
                    {p.featured && (
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                        featured
                      </span>
                    )}
                  </div>

                </td>

                <td className="py-3 px-4 text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>

                <td className="py-3 px-4 text-right">

                  <button
                    onClick={() => navigate(`/admin/properties/${p.id}`)}
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    View
                  </button>

                </td>

              </tr>

            ))}

            {properties.length === 0 && !loading && (

              <tr>

                <td
                  colSpan="7"
                  className="py-12 text-center text-gray-500"
                >
                  No properties found
                </td>

              </tr>

            )}

          </tbody>

        </table>

      </div>


      {/* PAGINATION */}

      {pagination.pages > 1 && (

        <div className="flex items-center justify-between">

          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 text-sm border border-soft rounded-md disabled:opacity-50"
          >
            Previous
          </button>

          <span className="text-sm text-gray-600">
            Page {page} of {pagination.pages}
          </span>

          <button
            disabled={page === pagination.pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 text-sm border border-soft rounded-md disabled:opacity-50"
          >
            Next
          </button>

        </div>

      )}

    </div>
  );
};

export default AdminProperties;

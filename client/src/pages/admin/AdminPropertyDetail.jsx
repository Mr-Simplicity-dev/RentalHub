import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/api";
import Loader from "../../components/common/Loader";

const AdminPropertyDetail = () => {

  const { id } = useParams();
  const navigate = useNavigate();

  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const loadProperty = useCallback(async () => {

    setLoading(true);

    try {

      const res = await api.get(`/admin/properties/${id}`);

      if (res.data?.success) {
        setProperty(res.data.data);
      }

    } catch (err) {
      console.error("Failed to load property", err);
    } finally {
      setLoading(false);
    }

  }, [id]);

  useEffect(() => {
    loadProperty();
  }, [loadProperty]);


  const unlist = async () => {

    if (!window.confirm("Unlist this property?")) return;

    setWorking(true);

    try {

      await api.patch(`/admin/properties/${id}/unlist`);
      await loadProperty();

    } finally {
      setWorking(false);
    }

  };


  const relist = async () => {

    if (!window.confirm("Relist this property?")) return;

    setWorking(true);

    try {

      await api.patch(`/admin/properties/${id}/relist`);
      await loadProperty();

    } finally {
      setWorking(false);
    }

  };

  const toggleFeatured = async () => {

    if (!window.confirm(
      property.featured
        ? "Remove this property from featured listings?"
        : "Add this property to featured listings?"
    )) return;

    setWorking(true);

    try {
      await api.patch(
        `/admin/properties/${id}/${property.featured ? "unfeature" : "feature"}`
      );
      await loadProperty();
    } finally {
      setWorking(false);
    }
  };


  if (loading) return <Loader fullScreen />;

  if (!property) {
    return (
      <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">
        Property not found
      </div>
    );
  }

  const isActive = Boolean(property.is_available);

  return (

    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">

      {/* BACK BUTTON */}

      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        ← Back
      </button>


      {/* PROPERTY HEADER */}

      <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">

        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">

          <div className="text-center md:text-left">

            <h2 className="text-2xl font-semibold">
              {property.title}
            </h2>

            <span
              className={`inline-block mt-2 px-2 py-1 text-xs rounded-full
                ${
                  isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }
              `}
            >
              {isActive ? "available" : "unlisted"}
            </span>

            {property.featured && (
              <span className="inline-block mt-2 ml-2 px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700">
                featured
              </span>
            )}

          </div>


          {/* ADMIN ACTIONS */}

          <div className="flex gap-2">

            {isActive ? (

              <button
                onClick={unlist}
                disabled={working}
                className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Unlist Property
              </button>

            ) : (

              <button
                onClick={relist}
                disabled={working}
                className="px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Relist Property
              </button>

            )}

            <button
              onClick={toggleFeatured}
              disabled={working}
              className={`px-3 py-2 text-sm rounded-lg disabled:opacity-50 ${
                property.featured
                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              }`}
            >
              {property.featured ? "Unfeature" : "Feature Property"}
            </button>

          </div>

        </div>

      </div>


      {/* PROPERTY DETAILS */}

    <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">

  <h3 className="text-lg font-semibold mb-4 text-center">
    Property Information
  </h3>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">

    <div>
      <span className="text-gray-500">Owner</span>
      <p className="font-medium">{property.landlord_name}</p>
    </div>

    <div>
      <span className="text-gray-500">Email</span>
      <p className="font-medium">{property.landlord_email}</p>
    </div>

    <div>
      <span className="text-gray-500">City</span>
      <p className="font-medium">{property.city}</p>
    </div>

    <div>
      <span className="text-gray-500">State</span>
      <p className="font-medium">{property.state}</p>
    </div>

    <div>
      <span className="text-gray-500">Rent</span>
      <p className="font-medium">
        ₦{Number(property.rent_amount || 0).toLocaleString()}
      </p>
    </div>

    <div>
      <span className="text-gray-500">Featured</span>
      <p className="font-medium">{property.featured ? "Yes" : "No"}</p>
    </div>

    <div>
      <span className="text-gray-500">Created</span>
      <p className="font-medium">
        {new Date(property.created_at).toLocaleString()}
      </p>
    </div>

  </div>

</div>


{/* DESCRIPTION */}

{property.description && (

  <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">

    <h3 className="text-lg font-semibold mb-3 text-center">
      Description
    </h3>

    <p className="text-gray-700 text-sm leading-relaxed">
      {property.description}
    </p>

  </div>

)}

    </div>

  );
};

export default AdminPropertyDetail;

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
  const [actionDialog, setActionDialog] = useState({
    open: false,
    action: "",
    title: "",
    reason: "",
    error: "",
  });

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


  const openActionDialog = (action) => {
    const labels = {
      unlist: "Unlist Property",
      relist: "Relist Property",
      feature: "Feature Property",
      unfeature: "Unfeature Property",
    };
    setActionDialog({
      open: true,
      action,
      title: labels[action] || "Update Property",
      reason: "",
      error: "",
    });
  };

  const closeActionDialog = () => {
    setActionDialog({
      open: false,
      action: "",
      title: "",
      reason: "",
      error: "",
    });
  };

  const submitPropertyAction = async () => {
    const reason = actionDialog.reason.trim();
    if (!reason) {
      setActionDialog((prev) => ({ ...prev, error: "A reason is required" }));
      return;
    }

    setWorking(true);

    try {
      await api.patch(`/admin/properties/${id}/${actionDialog.action}`, { reason });
      closeActionDialog();
      await loadProperty();
    } catch (err) {
      setActionDialog((prev) => ({
        ...prev,
        error: err.response?.data?.message || "Action failed",
      }));
    } finally {
      setWorking(false);
    }
  };

  const formatOperationLabel = (eventType) =>
    String(eventType || "updated").replace(/^property_/, "").replace(/_/g, " ");


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
                onClick={() => openActionDialog("unlist")}
                disabled={working}
                className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Unlist Property
              </button>

            ) : (

              <button
                onClick={() => openActionDialog("relist")}
                disabled={working}
                className="px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Relist Property
              </button>

            )}

            <button
              onClick={() => openActionDialog(property.featured ? "unfeature" : "feature")}
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

      <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">
        <h3 className="text-lg font-semibold mb-4 text-center">
          Governance History
        </h3>

        {Array.isArray(property.operations) && property.operations.length > 0 ? (
          <div className="space-y-3">
            {property.operations.map((operation) => (
              <div
                key={operation.id}
                className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold capitalize text-gray-800">
                    {formatOperationLabel(operation.event_type)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(operation.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-gray-600">
                  {operation.note || "No note recorded"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  By {operation.actor_name || "Admin"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-gray-500">
            No property governance actions recorded yet.
          </p>
        )}
      </div>

      {actionDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl2 bg-white p-6 shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                Property governance
              </p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">
                {actionDialog.title}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                This action affects the marketplace visibility of {property.title}.
              </p>
            </div>

            <label className="text-sm font-medium text-gray-700">
              Reason
              <textarea
                value={actionDialog.reason}
                onChange={(event) =>
                  setActionDialog((prev) => ({
                    ...prev,
                    reason: event.target.value,
                    error: "",
                  }))
                }
                className="input mt-1 min-h-[120px]"
                placeholder="Explain why this property action is being taken"
              />
            </label>

            {actionDialog.error && (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionDialog.error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeActionDialog}
                disabled={working}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPropertyAction}
                disabled={working}
                className={
                  actionDialog.action === "unlist"
                    ? "btn btn-danger"
                    : "btn btn-primary"
                }
              >
                {working ? "Saving..." : actionDialog.title}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>

  );
};

export default AdminPropertyDetail;

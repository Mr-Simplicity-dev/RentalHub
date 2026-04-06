import React, { useEffect, useState } from 'react';
import { FaTag, FaRuler, FaExclamationTriangle } from 'react-icons/fa';
import api from '../../services/api';
import Loader from '../common/Loader';

const DamageReportCard = ({ propertyId }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReport();
  }, [propertyId]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/properties/${propertyId}/damage-report/latest-published`);
      
      if (response.data?.success && response.data?.data) {
        setReport(response.data.data);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load damage report:', err);
      setError(null); // Silent fail - no report is ok
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  if (!report) {
    return null; // No report available
  }

  const getSeverityColor = (severity) => {
    const colors = {
      minor: 'bg-green-100 text-green-800',
      moderate: 'bg-yellow-100 text-yellow-800',
      severe: 'bg-red-100 text-red-800',
    };
    return colors[severity] || 'bg-gray-100 text-gray-800';
  };

  const getUrgencyColor = (urgency) => {
    const colors = {
      low: 'text-green-600',
      medium: 'text-yellow-600',
      high: 'text-red-600',
    };
    return colors[urgency] || 'text-gray-600';
  };

  const getUrgencyIcon = (urgency) => {
    if (urgency === 'high') return '🔴';
    if (urgency === 'medium') return '🟡';
    return '🟢';
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FaExclamationTriangle className="text-amber-600" />
            Property Condition Report
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Latest damage assessment for this property
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Damage Type */}
        <div className="rounded-lg bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Damage Type</p>
          <p className="mt-2 font-semibold text-gray-900 capitalize">
            {report.damage_type?.replace(/_/g, ' ')}
          </p>
          {report.room_location && (
            <p className="text-sm text-gray-600">Location: {report.room_location}</p>
          )}
        </div>

        {/* Severity */}
        <div className="rounded-lg bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Severity</p>
          <div className="mt-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize ${getSeverityColor(report.severity)}`}>
              {report.severity}
            </span>
          </div>
        </div>

        {/* Dimensions */}
        {(report.width_cm || report.height_cm) && (
          <div className="rounded-lg bg-white p-4">
            <div className="flex items-center gap-2">
              <FaRuler className="text-indigo-600" />
              <p className="text-xs uppercase tracking-wide text-gray-500">Size</p>
            </div>
            <p className="mt-2 font-semibold text-gray-900">
              {report.width_cm}cm × {report.height_cm}cm
            </p>
          </div>
        )}

        {/* Depth Level */}
        {report.depth_level && (
          <div className="rounded-lg bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Depth</p>
            <p className="mt-2 font-semibold text-gray-900 capitalize">{report.depth_level}</p>
          </div>
        )}

        {/* Urgency */}
        {report.urgency && (
          <div className="rounded-lg bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Urgency</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-lg ${getUrgencyColor(report.urgency)}`}>
                {getUrgencyIcon(report.urgency)}
              </span>
              <p className="font-semibold text-gray-900 capitalize">{report.urgency}</p>
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      {report.description && (
        <div className="mt-4 rounded-lg bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Description</p>
          <p className="mt-2 text-gray-700">{report.description}</p>
        </div>
      )}

      {/* Recommendation */}
      {report.recommendation && (
        <div className="mt-4 rounded-lg bg-blue-50 p-4">
          <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Recommendation</p>
          <p className="mt-2 text-blue-900">{report.recommendation}</p>
        </div>
      )}

      {/* AI Analysis */}
      {report.ai_analysis && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <details className="cursor-pointer">
            <summary className="text-xs uppercase tracking-wide text-gray-600 font-semibold hover:text-gray-900">
              AI Analysis Details
            </summary>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              {report.ai_analysis.repair_recommendation && (
                <p><strong>Repair Suggestion:</strong> {report.ai_analysis.repair_recommendation}</p>
              )}
              <p className="text-xs text-gray-500">
                Report submitted on {new Date(report.created_at).toLocaleDateString()}
              </p>
            </div>
          </details>
        </div>
      )}

      {/* Photos */}
      {report.photo_urls && report.photo_urls.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Photos</p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {report.photo_urls.map((photo, idx) => (
              <div key={idx} className="rounded-lg overflow-hidden bg-gray-200">
                <img
                  src={photo}
                  alt={`Damage photo ${idx + 1}`}
                  className="h-32 w-full object-cover hover:opacity-80 transition-opacity"
                  onError={(e) => (e.target.src = '/images/broken-image.png')}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DamageReportCard;

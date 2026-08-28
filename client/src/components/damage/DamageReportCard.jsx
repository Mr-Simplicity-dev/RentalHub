import React, { useCallback, useEffect, useState } from 'react';
import { FaRuler, FaExclamationTriangle } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Loader from '../common/Loader';

const DamageReportCard = ({ propertyId }) => {
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/properties/${propertyId}/damage-report/latest-published`);
      
      if (response.data?.success && response.data?.data) {
        setReport(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load damage report:', err);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

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
    if (urgency === 'high') return 'ðŸ”´';
    if (urgency === 'medium') return 'ðŸŸ¡';
    return 'ðŸŸ¢';
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FaExclamationTriangle className="text-amber-600" />
            {t('damage_card.condition_report', 'Property Condition Report')}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('damage_card.subtitle', 'Latest damage assessment for this property')}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Damage Type */}
        <div className="rounded-lg bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">{t('damage_card.damage_type', 'Damage Type')}</p>
          <p className="mt-2 font-semibold text-gray-900 capitalize">
            {report.damage_type?.replace(/_/g, ' ')}
          </p>
          {report.room_location && (
            <p className="text-sm text-gray-600">{t('damage_card.location', 'Location: {{value}}', { value: report.room_location })}</p>
          )}
        </div>

        {/* Severity */}
        <div className="rounded-lg bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">{t('damage_card.severity', 'Severity')}</p>
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
              <p className="text-xs uppercase tracking-wide text-gray-500">{t('damage_card.size', 'Size')}</p>
            </div>
            <p className="mt-2 font-semibold text-gray-900">
              {report.width_cm}cm Ã— {report.height_cm}cm
            </p>
          </div>
        )}

        {/* Depth Level */}
        {report.depth_level && (
          <div className="rounded-lg bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{t('damage_card.depth', 'Depth')}</p>
            <p className="mt-2 font-semibold text-gray-900 capitalize">{report.depth_level}</p>
          </div>
        )}

        {/* Urgency */}
        {report.urgency && (
          <div className="rounded-lg bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{t('damage_card.urgency', 'Urgency')}</p>
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
          <p className="text-xs uppercase tracking-wide text-gray-500">{t('damage_card.description', 'Description')}</p>
          <p className="mt-2 text-gray-700">{report.description}</p>
        </div>
      )}

      {/* Recommendation */}
      {report.recommendation && (
        <div className="mt-4 rounded-lg bg-blue-50 p-4">
          <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">{t('damage_card.recommendation', 'Recommendation')}</p>
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
                <p><strong>{t('damage_card.repair_suggestion', 'Repair Suggestion:')}</strong> {report.ai_analysis.repair_recommendation}</p>
              )}
              <p className="text-xs text-gray-500">
                {t('damage_card.submitted_on', 'Report submitted on {{date}}', { date: new Date(report.created_at).toLocaleDateString() })}
              </p>
            </div>
          </details>
        </div>
      )}

      {/* Photos */}
      {report.photo_urls && report.photo_urls.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{t('damage_card.photos', 'Photos')}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {report.photo_urls.map((photo, idx) => (
              <div key={idx} className="rounded-lg overflow-hidden bg-gray-200">
                <img
                  src={photo}
                  alt={`Damage report ${idx + 1}`}
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


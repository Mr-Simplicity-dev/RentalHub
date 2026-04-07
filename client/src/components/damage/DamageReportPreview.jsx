import React, { useMemo } from 'react';

/**
 * DamageReportPreview - Display damage report to tenants on property details
 * Shows: latest damage report with AI analysis
 * Hides: draft reports, internal-only reports
 */
const DamageReportPreview = ({ damageReports }) => {
  // Get latest published damage report (not draft)
  const latestReport = useMemo(() => {
    if (!damageReports || !Array.isArray(damageReports) || damageReports.length === 0) {
      return null;
    }
    // Sort by date descending and get the first published one
    return (
      damageReports
        .filter((r) => {
          if (r.status) return r.status === 'published';
          if (typeof r.is_visible_to_tenant === 'boolean') return r.is_visible_to_tenant;
          return !r.is_draft && r.is_published;
        })
        .sort((a, b) => {
          const aDate = new Date(a.published_at || a.created_at || a.reported_at || 0);
          const bDate = new Date(b.published_at || b.created_at || b.reported_at || 0);
          return bDate - aDate;
        })[0] || null
    );
  }, [damageReports]);

  if (!latestReport) {
    return null;
  }

  const getDamageTypeLabel = (type) => {
    const TYPES = {
      scratch: '🔨 Scratch',
      crack: '⚡ Crack',
      hole: '🕳️ Hole',
      dent: '▼ Dent',
      stain: '🩹 Stain',
      water_damage: '💧 Water Damage',
      mold: '🍃 Mold',
      other: '❓ Other',
    };
    return TYPES[type] || type;
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'minor':
        return 'bg-emerald-100 text-emerald-700';
      case 'moderate':
        return 'bg-amber-100 text-amber-700';
      case 'severe':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'low':
        return 'bg-sky-100 text-sky-700';
      case 'medium':
        return 'bg-orange-100 text-orange-700';
      case 'high':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const reportDate = new Date(latestReport.published_at || latestReport.created_at || latestReport.reported_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between border-b border-blue-200 pb-3">
        <h3 className="text-lg font-semibold text-blue-900">📋 Property Condition Report</h3>
        <time className="text-xs text-blue-700">Updated: {reportDate}</time>
      </div>

      <div className="space-y-4">
        {/* Main Damage Card */}
        <div className="rounded-lg bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">
              {getDamageTypeLabel(latestReport.damage_type)}
            </span>
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getSeverityColor(latestReport.severity)}`}>
              {latestReport.severity || 'unspecified'}
            </span>
            {latestReport.urgency && (
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getUrgencyColor(latestReport.urgency)}`}>
                Urgency: {latestReport.urgency}
              </span>
            )}
          </div>

          <p className="mb-3 text-sm text-gray-700">
            <strong>Location:</strong> {latestReport.room_location}
          </p>

          {latestReport.description && (
            <p className="mb-3 text-sm text-gray-700">
              <strong>Details:</strong> {latestReport.description}
            </p>
          )}

          {/* Dimensions if available */}
          {(latestReport.width_cm || latestReport.height_cm) && (
            <p className="mb-3 text-sm text-gray-700">
              <strong>Size:</strong> {latestReport.width_cm || '?'} cm × {latestReport.height_cm || '?'} cm
            </p>
          )}

          {latestReport.depth_level && (
            <p className="text-sm text-gray-700">
              <strong>Depth:</strong> {latestReport.depth_level}
            </p>
          )}
        </div>

        {/* AI Analysis if available */}
        {latestReport.ai_analysis && (
          <div className="rounded-lg bg-emerald-50 p-4">
            <p className="mb-2 text-xs font-semibold text-emerald-900">🤖 AI Assessment</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {latestReport.ai_analysis.damage_type && (
                <div>
                  <p className="text-emerald-700">
                    <strong>Type:</strong> {latestReport.ai_analysis.damage_type}
                  </p>
                </div>
              )}
              {latestReport.ai_analysis.severity && (
                <div>
                  <p className="text-emerald-700">
                    <strong>Severity:</strong> {latestReport.ai_analysis.severity}
                  </p>
                </div>
              )}
              {latestReport.ai_analysis.estimated_width_cm || latestReport.ai_analysis.estimated_height_cm ? (
                <div>
                  <p className="text-emerald-700">
                    <strong>Size:</strong> {latestReport.ai_analysis.estimated_width_cm || '?'} ×{' '}
                    {latestReport.ai_analysis.estimated_height_cm || '?'} cm
                  </p>
                </div>
              ) : null}
              {latestReport.ai_analysis.depth_level && (
                <div>
                  <p className="text-emerald-700">
                    <strong>Depth:</strong> {latestReport.ai_analysis.depth_level}
                  </p>
                </div>
              )}
            </div>
            {latestReport.ai_analysis.description && (
              <p className="mt-2 text-xs text-emerald-700">
                <strong>Analysis:</strong> {latestReport.ai_analysis.description}
              </p>
            )}
          </div>
        )}

        {/* Photo if available */}
        {(latestReport.photo_url || (Array.isArray(latestReport.photo_urls) && latestReport.photo_urls[0])) && (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <img
              src={latestReport.photo_url || latestReport.photo_urls[0]}
              alt={`Damage at ${latestReport.room_location}`}
              className="h-auto w-full object-cover"
            />
          </div>
        )}

        <p className="text-xs text-gray-500">
          This report was prepared by the landlord/property manager on {reportDate} using AI-assisted analysis.
        </p>
      </div>
    </div>
  );
};

export default DamageReportPreview;

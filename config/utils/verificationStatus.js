const labels = Object.freeze({verified:'Verified',pending:'Pending review',provider_pending:'Verification in progress',revalidation_required:'Verification update required',rejected:'Rejected',not_submitted:'Not submitted',unknown:'Status unavailable'});
function getReviewStatus(user = {}, status) {
 const source = status || user || {};
 const raw = source.review_status || source.identity_verification_status || user?.identity_verification_status;
 if (raw === 'revalidation_required') return raw;
 if (source.identity === true || source.identity_verified === true || (!status && user?.identity_verified === true)) return 'verified';
 if (raw === 'verified' && (source.identity === false || source.identity_verified === false)) return 'unknown';
 if (raw && Object.prototype.hasOwnProperty.call(labels, raw)) return raw;
 if (raw) return 'unknown';
 if (source.passport === true || source.passport_photo_url) return 'pending';
 return 'not_submitted';
}
const getReviewStatusLabel = (user, status) => labels[getReviewStatus(user, status)];
module.exports = {getReviewStatus,getReviewStatusLabel,labels};

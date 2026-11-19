const { canonicalZone, zoneForState } = require('./territorialZones');
const normalized = value => String(value || '').trim().toLowerCase();
const phoneKey = value => {
  let digits=String(value || '').replace(/\D/g,'');
  if(digits.length===13&&digits.startsWith('234'))digits=digits.slice(3);
  else if(digits.length===11&&digits.startsWith('0'))digits=digits.slice(1);
  return digits.length>=10&&digits.length<=15?digits:null;
};
function canOperateBooking(booking,user,domain) {
  if(!booking||!user)return false;
  const role=String(user.user_type || '');
  const opposite=domain==='fumigation'?'transportation':'fumigation';
  if(role.includes(opposite))return false;
  if(role==='super_admin'||role==='super_'+domain+'_admin')return true;
  const roles=new Set(['admin','lga_admin','state_admin','zonal_admin',domain+'_admin','lga_'+domain+'_admin','state_'+domain+'_admin','zonal_'+domain+'_admin']);
  if(roles.has(role)) {
    const state=normalized(booking.property_state || booking.state_name || booking.state);
    const lga=normalized(booking.property_lga || booking.lga_name || booking.lga);
    if(role.startsWith('zonal_')){const zone=canonicalZone(user.assigned_zone);return Boolean(zone&&state&&zone===canonicalZone(zoneForState(state)));}
    if(!state||!user.assigned_state||state!==normalized(user.assigned_state))return false;
    if(role.startsWith('state_'))return true;
    return Boolean(lga&&(user.assigned_lga||user.assigned_city)&&lga===normalized(user.assigned_lga||user.assigned_city));
  }
  const assignedId=domain==='fumigation'?(booking.team_id||booking.assigned_team_id||booking.team_leader_id):booking.driver_id;
  if(assignedId&&Number(assignedId)===Number(user.id))return true;
  const assignedPhone=phoneKey(domain==='fumigation'?(booking.team_phone||booking.assigned_team_phone||booking.provider_phone):booking.driver_phone);
  return Boolean(user.phone_verified===true&&assignedPhone&&assignedPhone===phoneKey(user.phone));
}
function assertTrackingAccess(booking,user,domain) {
  if(Number(booking.tenant_id)===Number(user.id)||canOperateBooking(booking,user,domain))return;
  const error=new Error('You are not authorised to view this service booking.');error.statusCode=403;throw error;
}
module.exports={canOperateBooking,assertTrackingAccess};

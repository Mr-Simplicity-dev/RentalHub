const {test}=require('node:test');const assert=require('node:assert/strict');
const {canOperateBooking,assertTrackingAccess}=require('../../config/utils/serviceTrackingAccess');
const booking={id:1,tenant_id:4,driver_id:10,driver_phone:'+2348031234567',driver_name:'Matching name',assigned_team_id:20,team_phone:'+2348023334444',property_state:'Kogi',property_lga:'Lokoja'};
for(const domain of ['transportation','fumigation'])test(domain+' tracking rejects other customers and allows only the owner or authorised operator',()=>{
 assert.doesNotThrow(()=>assertTrackingAccess(booking,{id:4,user_type:'tenant'},domain));
 assert.throws(()=>assertTrackingAccess(booking,{id:9,user_type:'landlord'},domain),{statusCode:403});
 assert.doesNotThrow(()=>assertTrackingAccess(booking,{id:99,user_type:'super_admin'},domain));
});
test('a matching name, phone suffix or unverified phone cannot become a driver',()=>{
 assert.equal(canOperateBooking(booking,{id:2,full_name:'Matching name',user_type:'tenant'},'transportation'),false);
 assert.equal(canOperateBooking(booking,{id:2,phone:'1234567',phone_verified:true,user_type:'tenant'},'transportation'),false);
 assert.equal(canOperateBooking(booking,{id:2,phone:'08031234567',phone_verified:false,user_type:'tenant'},'transportation'),false);
 assert.equal(canOperateBooking(booking,{id:2,phone:'08031234567',phone_verified:true,user_type:'tenant'},'transportation'),true);
});
test('state, LGA and zone administrators remain inside their assigned area',()=>{
 for(const domain of ['fumigation','transportation']){
  assert.equal(canOperateBooking(booking,{id:9,user_type:'state_'+domain+'_admin',assigned_state:'Lagos'},domain),false);
  assert.equal(canOperateBooking(booking,{id:9,user_type:'state_'+domain+'_admin',assigned_state:'Kogi'},domain),true);
  assert.equal(canOperateBooking(booking,{id:9,user_type:'lga_'+domain+'_admin',assigned_state:'Kogi',assigned_city:'Okene'},domain),false);
  assert.equal(canOperateBooking(booking,{id:9,user_type:'lga_'+domain+'_admin',assigned_state:'Kogi',assigned_city:'Lokoja'},domain),true);
  assert.equal(canOperateBooking(booking,{id:9,user_type:'zonal_'+domain+'_admin',assigned_zone:'wrong'},domain),false);
 }
 assert.equal(canOperateBooking(booking,{id:9,user_type:'super_transportation_admin'},'fumigation'),false);
});
test('both actual tracking summary services reject other customers before reading telemetry',async()=>{
 for(const moduleName of ['fumigationTrackingService','transportationTrackingService']){
  const service=require('../../services/'+moduleName),original=service.getBookingForTracking;
  service.getBookingForTracking=async()=>booking;
  try{await assert.rejects(service.getTrackingSummary(1,{id:9,user_type:'tenant'}),{statusCode:403});}finally{service.getBookingForTracking=original;}
 }
});

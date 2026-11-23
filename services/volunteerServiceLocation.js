const locations=require('../data/nigeriaLocations');
const normalize=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
function findState(value){const key=normalize(value);return locations.find(state=>[state.state,state.displayName,state.slug,...(state.state==='FCT'?['Federal Capital Territory','FCT Abuja']:[])].some(name=>normalize(name)===key));}
function getServicePreference(role,body,activations){
 if(role.opportunity_type!=='volunteer')return null;
 const legacy=body.preferred_service_state===undefined&&body.preferred_service_lga===undefined;
 const state=findState(legacy?body.state_name:body.preferred_service_state);
 if(!state)throw Error('Choose the state where you want to volunteer.');
 const required=role.service_state?findState(role.service_state):null;
 if(!activations&&role.service_state&&(!required||required.state!==state.state))throw Error('This volunteer opportunity is available in FCT only.');
 const lga=state.lgas.find(name=>normalize(name)===normalize(legacy?body.lga_name:body.preferred_service_lga));
 if(!lga)throw Error('Choose a valid local government area where you want to volunteer.');
 if(activations&&!activations.some(row=>row.volunteer_is_active&&findState(row.state_name)?.state===state.state&&(row.lga_name==='__ALL__'||normalize(row.lga_name)===normalize(lga))))throw Error('Volunteer applications are not open for this state and local government area yet.');
 return {state:state.displayName,lga,source:legacy?'legacy_residence':'applicant_choice'};
}
module.exports={findState,getServicePreference};

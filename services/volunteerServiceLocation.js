const locations=require('../data/nigeriaLocations');
const normalize=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
function findState(value){const key=normalize(value);return locations.find(state=>[state.state,state.displayName,state.slug,...(state.state==='FCT'?['Federal Capital Territory','FCT Abuja']:[])].some(name=>normalize(name)===key));}
function getServicePreference(role,body){
 if(role.opportunity_type!=='volunteer')return null;
 const legacy=body.preferred_service_state===undefined&&body.preferred_service_lga===undefined;
 const state=findState(legacy?body.state_name:body.preferred_service_state);
 if(!state)throw Error('Choose the state where you want to volunteer.');
 const required=role.service_state?findState(role.service_state):null;
 if(role.service_state&&(!required||required.state!==state.state))throw Error('This volunteer opportunity is available in FCT only.');
 const lga=state.lgas.find(name=>normalize(name)===normalize(legacy?body.lga_name:body.preferred_service_lga));
 if(!lga)throw Error('Choose a valid local government area where you want to volunteer.');
 return {state:state.displayName,lga,source:legacy?'legacy_residence':'applicant_choice'};
}
module.exports={findState,getServicePreference};

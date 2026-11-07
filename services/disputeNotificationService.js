const db=require('../config/middleware/database');
const logger=require('../config/utils/logger');
const {createNotification}=require('../config/utils/notificationService');
const {lawyerTerritoryMatches}=require('../config/utils/stateScope');
const COPY={created:['Property dispute opened','A formal property dispute has been opened. Read the shared case details.'],message:['New dispute message','There is a new message in your property dispute.'],evidence:['New dispute evidence','New evidence has been added to your property dispute.'],evidence_review:['Dispute evidence reviewed','An evidence review has been recorded. Open the case for details.'],summary:['Dispute update','A case summary has been updated.'],resolved:['Dispute outcome recorded','An outcome has been recorded for your dispute. Open the case to read it.'],sealed:['Dispute record sealed','Your dispute record has been sealed against further changes.'],handover:['Support case linked','Your support request is now linked to a formal dispute. The private support conversation remains private.']};
exports.notifyDispute=async(disputeId,kind,actorId,{includeActor=false}={})=>{
 try{
  const dispute=(await db.query('SELECT d.*,s.state_name AS property_state FROM disputes d JOIN properties p ON p.id=d.property_id LEFT JOIN states s ON s.id=p.state_id WHERE d.id=$1',[disputeId])).rows[0];
  if(!dispute)return {sent:0};
  const recipients=new Set([dispute.opened_by,dispute.against_user,dispute.responsible_support_id].map(Number).filter(id=>id>0));
  const lawyers=(await db.query("SELECT DISTINCT u.id,u.assigned_state,u.assigned_zone FROM legal_authorizations la JOIN users u ON u.id=la.lawyer_user_id WHERE la.status='active' AND u.identity_verified=TRUE AND u.deleted_at IS NULL AND u.is_active IS DISTINCT FROM FALSE AND u.user_type IN ('lawyer','state_lawyer','zonal_lawyer','super_lawyer') AND (la.property_id=$1 OR (la.property_id IS NULL AND la.client_user_id=ANY($2::int[])))",[dispute.property_id,[dispute.opened_by,dispute.against_user]])).rows;
  for(const lawyer of lawyers)if(lawyerTerritoryMatches(lawyer.assigned_state,lawyer.assigned_zone,dispute.property_state))recipients.add(Number(lawyer.id));
  if(!includeActor)recipients.delete(Number(actorId));
  const [title,message]=COPY[kind]||COPY.summary;
  let sent=0;
  for(const id of recipients){try{if(await createNotification(id,'dispute_'+kind,title,message,'/dispute/'+disputeId))sent++;}catch(error){logger.error('Dispute notification delivery failed',{disputeId,userId:id,code:error.code});}}
  return {sent};
 }catch(error){logger.error('Dispute notification failed',{disputeId,code:error.code});return {sent:0};}
};

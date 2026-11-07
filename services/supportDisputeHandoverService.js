const db=require('../config/middleware/database');
const {getPropertyDisputeParticipants}=require('../config/utils/propertyDisputeParticipants');
const {createNotification}=require('../config/utils/notificationService');
const {notifyDispute}=require('./disputeNotificationService');
const policy=require('./contactPolicyService');
const STAFF=new Set(['super_admin','super_support_admin','zonal_admin','state_support_admin','lga_support_admin']);
const fail=(status,message)=>Object.assign(new Error(message),{statusCode:status});
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const mayAccess=(actor,ticket)=>require('../routes/support').canSupportAdminAccessTicket(actor,ticket);
const getTicket=async(req,queryable=db)=>{
 if(!positive(req.params.ticketId))throw fail(400,'Choose a valid support ticket.');
 const ticket=(await queryable.query('SELECT * FROM support_tickets WHERE id=$1'+(queryable===db?'':' FOR UPDATE'),[req.params.ticketId])).rows[0];
 if(!ticket)throw fail(404,'Support ticket not found.');
 if(Number(ticket.user_id)!==Number(req.user.id)&&!mayAccess(req.user,ticket))throw fail(403,'You cannot access this support ticket.');
 return ticket;
};
const proposal=async(ticketId,queryable=db)=>(await queryable.query(`SELECT h.id,h.status,h.title,h.shared_summary,h.existing_dispute_id,h.dispute_id,h.created_at,h.responded_at,
 p.title AS property_title,u.full_name AS other_party_name,COALESCE(actual_lead.full_name,lead.full_name) AS responsible_name
 FROM support_dispute_handovers h JOIN properties p ON p.id=h.property_id
 JOIN users u ON u.id=h.against_user_id JOIN users lead ON lead.id=h.responsible_support_id
 LEFT JOIN disputes linked ON linked.id=h.dispute_id LEFT JOIN users actual_lead ON actual_lead.id=linked.responsible_support_id
 WHERE h.ticket_id=$1 ORDER BY h.id DESC LIMIT 1`,[ticketId])).rows[0]||null;
const properties=async(customerId)=>(await db.query(`SELECT p.id,p.title,s.state_name,p.city
 FROM properties p LEFT JOIN states s ON s.id=p.state_id
 WHERE p.deleted_at IS NULL AND (p.landlord_id=$1 OR p.user_id=$1 OR EXISTS(
 SELECT 1 FROM applications a WHERE a.property_id=p.id AND a.tenant_id=$1 AND a.status='approved'))
 ORDER BY p.id DESC LIMIT 200`,[customerId])).rows;
const propertyAccess=async(actor,customerId,propertyId,queryable=db)=>{
 if(!positive(propertyId))throw fail(400,'Choose a property connected to this customer.');
 const property=(await queryable.query('SELECT p.id,p.title,p.city,s.state_name FROM properties p LEFT JOIN states s ON s.id=p.state_id WHERE p.id=$1 AND p.deleted_at IS NULL',[propertyId])).rows[0];
 if(!property||!mayAccess(actor,{state:property.state_name,lga:property.city}))throw fail(403,'This property is outside your support area.');
 const people=await getPropertyDisputeParticipants(propertyId,queryable);
 if(!people?.participants.some(person=>Number(person.id)===Number(customerId)))throw fail(403,'The customer is not connected to this property.');
 return {property,people:people.participants.map(({id,full_name,user_type,relation})=>({id,full_name,user_type,relation}))};
};
exports.context=async req=>{
 const ticket=await getTicket(req);
 const result={proposal:await proposal(ticket.id),properties:[],participants:[],existing_disputes:[]};
 if(!STAFF.has(req.user.user_type))return result;
 result.properties=(await properties(ticket.user_id)).filter(p=>mayAccess(req.user,{state:p.state_name,lga:p.city}));
 if(req.query.property_id){
  const {people}=await propertyAccess(req.user,ticket.user_id,req.query.property_id);
  result.participants=people.filter(person=>Number(person.id)!==Number(ticket.user_id));
  result.existing_disputes=(await db.query("SELECT id,title,status,opened_by,against_user FROM disputes WHERE property_id=$1 AND (opened_by=$2 OR against_user=$2) AND status='open' AND is_legally_sealed=FALSE ORDER BY id DESC LIMIT 100",[req.query.property_id,ticket.user_id])).rows;
 }
 return result;
};
exports.request=async req=>{
 const ticket=await getTicket(req);
 if(!STAFF.has(req.user.user_type)||!mayAccess(req.user,ticket))throw fail(403,'Only authorised support staff can prepare a dispute handover.');
 if(!ticket.user_id||['closed','resolved'].includes(ticket.status))throw fail(409,'Use an open customer support ticket.');
 const customer=(await db.query("SELECT id FROM users WHERE id=$1 AND user_type IN ('tenant','landlord') AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE",[ticket.user_id])).rows[0];
 if(!customer)throw fail(400,'A signed-in tenant or landlord must own this ticket.');
 const {people,property}=await propertyAccess(req.user,ticket.user_id,req.body.property_id);
 const target=Number(req.body.against_user_id);
 if(target===Number(ticket.user_id)||!people.some(person=>Number(person.id)===target))throw fail(400,'Choose the other person connected to this property.');
 const title=String(req.body.title||'').trim(),summary=String(req.body.shared_summary||'').trim();
 if(title.length<5||title.length>160||summary.length<20||summary.length>5000)throw fail(400,'Write a title (5–160 characters) and a shared summary (20–5,000 characters).');
 await policy.enforce({userId:req.user.id,channel:'dispute_handover',contextKey:ticket.id,texts:[title,summary]});
 const existing=req.body.existing_dispute_id?Number(req.body.existing_dispute_id):null;
 if(existing){const match=(await db.query("SELECT id FROM disputes WHERE id=$1 AND property_id=$2 AND ((opened_by=$3 AND against_user=$4) OR (opened_by=$4 AND against_user=$3)) AND status='open' AND is_legally_sealed=FALSE",[existing,req.body.property_id,ticket.user_id,target])).rows[0];if(!match)throw fail(400,'Choose an open dispute between these same two people for this property.');}
 const active=(await db.query("SELECT id FROM support_dispute_handovers WHERE ticket_id=$1 AND status IN ('pending','accepted') LIMIT 1",[ticket.id])).rows[0];
 if(active)throw fail(409,'This ticket already has a pending or accepted handover.');
 let responsible=req.user.id;
 if(ticket.assigned_to){const lead=(await db.query("SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE AND account_suspended_at IS NULL",[ticket.assigned_to])).rows[0];if(lead&&STAFF.has(lead.user_type)&&mayAccess(lead,ticket)&&mayAccess(lead,{state:property.state_name,lga:property.city}))responsible=lead.id;}
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query(`INSERT INTO support_dispute_handovers(ticket_id,customer_id,property_id,against_user_id,requested_by,responsible_support_id,title,shared_summary,existing_dispute_id)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[ticket.id,ticket.user_id,req.body.property_id,target,req.user.id,responsible,title,summary,existing]);
  await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,metadata) VALUES($1,'DISPUTE_HANDOVER_REQUESTED','ticket',$2,$3)",[req.user.id,ticket.id,JSON.stringify({property_id:Number(req.body.property_id),other_party_id:target})]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');if(error.code==='23505')throw fail(409,'This ticket already has a pending or accepted handover.');throw error;}finally{client.release();}

 await createNotification(ticket.user_id,'dispute_handover_request','Review a proposed dispute','Support prepared a shared case summary. Review it before anything is shared with the other person.','/messages');
 return {proposal:await proposal(ticket.id)};
};
exports.listOwn=async req=>{if(!['tenant','landlord'].includes(req.user.user_type))return {proposals:[]};const rows=(await db.query("SELECT ticket_id FROM support_dispute_handovers WHERE customer_id=$1 AND status='pending' ORDER BY id DESC LIMIT 30",[req.user.id])).rows;return {proposals:(await Promise.all(rows.map(async row=>({...await proposal(row.ticket_id),ticket_id:row.ticket_id}))))};};
exports.respond=async req=>{
 if(!['tenant','landlord'].includes(req.user.user_type))throw fail(403,'Only the customer can answer this request.');
 if(!['accept','decline'].includes(req.body.decision)||!positive(req.params.handoverId))throw fail(400,'Choose Accept or Decline.');
 const client=await db.connect();let finished=false,h,caseId;
 try{
  await client.query('BEGIN');
  const ticket=await getTicket(req,client);
  h=(await client.query('SELECT * FROM support_dispute_handovers WHERE id=$1 AND ticket_id=$2 FOR UPDATE',[req.params.handoverId,ticket.id])).rows[0];
  if(!h||Number(h.customer_id)!==Number(req.user.id)||Number(ticket.user_id)!==Number(req.user.id))throw fail(403,'Only the customer who owns this ticket can decide.');
  if(h.status!=='pending')throw fail(409,'This handover has already been answered.');
  if(req.body.decision==='accept'){
   if(req.body.consent!==true)throw fail(400,'Confirm that this shared summary may be sent to the other person.');
   if(['closed','resolved'].includes(ticket.status))throw fail(409,'Support must reopen this ticket before the handover can proceed.');
   const staff=(await client.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE AND account_suspended_at IS NULL',[h.responsible_support_id])).rows[0];
   if(!staff||!STAFF.has(staff.user_type)||!mayAccess(staff,ticket))throw fail(409,'Support must review who is responsible before this can proceed.');
   const {people}=await propertyAccess(staff,h.customer_id,h.property_id,client);
   if(!people.some(person=>Number(person.id)===Number(h.against_user_id)))throw fail(409,'The people connected to this property have changed. Ask support to review the handover.');
   if(h.existing_dispute_id){
    const existing=(await client.query("SELECT * FROM disputes WHERE id=$1 AND property_id=$2 AND ((opened_by=$3 AND against_user=$4) OR (opened_by=$4 AND against_user=$3)) AND status='open' AND is_legally_sealed=FALSE FOR UPDATE",[h.existing_dispute_id,h.property_id,h.customer_id,h.against_user_id])).rows[0];
    if(!existing)throw fail(409,'The chosen dispute is no longer available for linking.');
    caseId=existing.id;
    await client.query('UPDATE disputes SET responsible_support_id=COALESCE(responsible_support_id,$2) WHERE id=$1',[caseId,staff.id]);
   }else{
    caseId=(await client.query("INSERT INTO disputes(property_id,opened_by,against_user,title,description,priority,responsible_support_id) VALUES($1,$2,$3,$4,$5,'normal',$6) RETURNING id",[h.property_id,h.customer_id,h.against_user_id,h.title,h.shared_summary,staff.id])).rows[0].id;
   }
   await client.query("UPDATE support_dispute_handovers SET status='accepted',dispute_id=$2,responded_at=NOW() WHERE id=$1",[h.id,caseId]);
  }else await client.query("UPDATE support_dispute_handovers SET status='declined',responded_at=NOW() WHERE id=$1",[h.id]);
  await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,metadata) VALUES($1,$2,'ticket',$3,$4)",[req.user.id,caseId?'DISPUTE_HANDOVER_ACCEPTED':'DISPUTE_HANDOVER_DECLINED',ticket.id,JSON.stringify({handover_id:h.id,dispute_id:caseId||null})]);
  await client.query('COMMIT');finished=true;
 }catch(error){if(!finished)await client.query('ROLLBACK');throw error;}finally{client.release();}
 if(caseId)await notifyDispute(caseId,h.existing_dispute_id?'handover':'created',req.user.id,{includeActor:true});
 else await createNotification(h.requested_by,'dispute_handover_declined','Dispute handover declined','The customer declined the proposed handover. Their support conversation remains private.','/support/tickets/'+h.ticket_id);
 return {proposal:await proposal(h.ticket_id)};
};

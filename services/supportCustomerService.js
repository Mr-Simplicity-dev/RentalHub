const db=require('../config/middleware/database');
const {normalize}=require('../config/utils/contactPolicy');
const STAFF=new Set(['super_admin','super_support_admin','zonal_admin','state_support_admin','lga_support_admin']);
const fail=(status,message)=>Object.assign(new Error(message),{statusCode:status});
const normalizePhone=value=>{
 const text=normalize(value).trim();if(!text)return null;
 if(text.length>40||!/^[+\d\s()-]+$/.test(text))throw fail(400,'Enter a valid phone number for support to contact you.');
 const phone=text.replace(/[\s()-]/g,'');
 if(!/^\+?\d{10,15}$/.test(phone))throw fail(400,'Enter a valid phone number for support to contact you.');
 return phone;
};
const customerQuery=`SELECT u.id,u.full_name,u.user_type,u.email,u.phone,u.email_verified,u.phone_verified,u.identity_verified,
 u.is_active,(u.account_suspended_at IS NOT NULL) AS suspended,u.created_at,s.state_name,u.preferred_lga_name AS lga
 FROM users u LEFT JOIN states s ON s.id=u.preferred_state_id`;
const profile=row=>row?Object.fromEntries(['id','full_name','user_type','email','phone','email_verified','phone_verified','identity_verified','is_active','suspended','created_at','state_name','lga'].map(key=>[key,row[key]])):null;
exports.normalizePhone=normalizePhone;
exports.addTicketSearch=(where,params,input)=>{
 const text=String(input||'').trim().slice(0,160);if(!text)return;
 params.push('%'+text+'%');const index=params.length;
 const clauses=[`st.subject ILIKE $${index}`,`st.description ILIKE $${index}`,`COALESCE(u.full_name,st.contact_name,'') ILIKE $${index}`,`COALESCE(u.email,st.contact_email,'') ILIKE $${index}`,`COALESCE(u.phone,st.contact_phone,'') ILIKE $${index}`];
 const phone=normalize(text);
 if(/^[+\d\s()-]{7,40}$/.test(phone)){
  params.push(phone.replace(/\D/g,''));const phoneIndex=params.length;
  clauses.push(`regexp_replace(COALESCE(u.phone,st.contact_phone,''),'[^0-9]','','g') LIKE '%'||$${phoneIndex}::text||'%'`);
  clauses.push(`rentalhub_phone_key(COALESCE(u.phone,st.contact_phone,''))=rentalhub_phone_key($${phoneIndex}::text)`);
 }
 where.push('('+clauses.join(' OR ')+')');
};
exports.captureGuestContact=body=>{
 const phone=normalizePhone(body.phone);
 if(Number(body.contact_details_version)===2&&!phone)throw fail(400,'Enter your phone number so support can contact you about this query.');
 return {name:String(body.name||'').trim().slice(0,255),email:String(body.email||'').trim().toLowerCase(),phone};
};
exports.getCustomer=async(actor,ticketId)=>{
 if(!STAFF.has(actor.user_type))throw fail(403,'Only authorised support staff can view customer details.');
 if(!/^\d+$/.test(String(ticketId))||Number(ticketId)<1)throw fail(400,'Choose a valid ticket.');
 const ticket=(await db.query('SELECT * FROM support_tickets WHERE id=$1',[ticketId])).rows[0];
 const mayAccess=require('../routes/support').canSupportAdminAccessTicket;
 if(!ticket||!mayAccess(actor,ticket))throw fail(403,'You cannot view this customer through this ticket.');
 let account=null,match='guest';
 const contact={name:ticket.contact_name||'Guest',email:ticket.contact_email||null,phone:ticket.contact_phone||null};
 if(ticket.user_id){
  const linked=(await db.query(customerQuery+" WHERE u.id=$1 AND u.deleted_at IS NULL AND u.user_type IN ('tenant','landlord')",[ticket.user_id])).rows[0];
  if(linked){account=profile(linked);match='linked';contact.name=linked.full_name;contact.email=linked.email;contact.phone=linked.phone;}
 }else if(contact.email&&contact.phone){
  const candidates=(await db.query(customerQuery+" WHERE LOWER(TRIM(u.email))=LOWER(TRIM($1)) AND rentalhub_phone_key(u.phone)=rentalhub_phone_key($2) AND u.deleted_at IS NULL AND u.user_type IN ('tenant','landlord') LIMIT 2",[contact.email,contact.phone])).rows;
  if(candidates.length===1&&mayAccess(actor,{state:candidates[0].state_name,lga:candidates[0].lga})){account=profile(candidates[0]);match='possible';}
 }
 await db.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,metadata) VALUES($1,'SUPPORT_CUSTOMER_DETAILS_VIEWED','ticket',$2,$3)",[actor.id,ticket.id,JSON.stringify({match,customer_id:account?.id||null})]);
 return {ticket_id:ticket.id,match,contact,account,read_only:true,ownership_verified:match==='linked'};
};

const clean = value => String(value || '').replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim();
const money = value => '₦' + Number(value || 0).toLocaleString('en-NG', {maximumFractionDigits: 2});
const card = (text, link, linkText, extra = {}) => ({handled: true, text, link, linkText, ...extra});
const ownQuestion = text => /\b(my|mine|who am i|do i have|am i|have i|i paid|i was charged|i submitted|i applied|status|pending|balance|withdrawal|withdrawals|ticket|tickets)\b/i.test(text);
const ticketIntent = text => /\b(open|raise|create|submit|file|lodge|send)\b.{0,45}\b(ticket|complaint|support request)\b/i.test(text);
const TOPICS = [
 ['withdrawals', /\b(withdraw\w*|payout\w*)\b/i],
 ['wallet', /\b(wallet|balance)\b/i],
 ['coverage', /\b(coverage|assistance|protection)\b/i],
 ['verification', /\b(verif\w*|identity|passport)\b/i],
 ['subscription', /\b(subscription|subscribed|expiry|expires|renewal)\b/i],
 ['refunds', /\b(refund\w*)\b/i],
 ['payments', /\b(pay\w*|paid|receipt\w*|transaction\w*|refund\w*)\b/i],
 ['applications', /\b(application\w*|applied)\b/i],
 ['savings', /\b(savings|saving|goal\w*)\b/i],
 ['transport', /\b(transport\w*|moving|logistics)\b/i],
 ['cleaning', /\b(fumigation|cleaning|pest)\b/i],
 ['tickets', /\b(ticket\w*|complaint\w*)\b/i],
 ['disputes', /\b(dispute\w*|case\w*)\b/i],
 ['properties', /\b(propert\w*|listing\w*|tenancy|tenant\w*|landlord|rent)\b/i],
 ['profile', /\b(profile|account|name|email|phone|who am i|details)\b/i],
];
const createAccountAssistant = ({query}) => async ({user, message, mode, previousTopic}) => {
 if (!user?.id || !['tenant','landlord'].includes(user.user_type)) {
  const error = new Error('Tenant or landlord sign-in required.'); error.status = 403; throw error;
 }
 const text = clean(message);
 if (!text || text.length > 2000) {const error = new Error('Enter a question of up to 2,000 characters.'); error.status = 400; throw error;}
 if (/\b(password|otp|one.time.code|security.code|nin|bvn|access.token|secret.key)\b/i.test(text) && !/\b(reset|forgot|change)\b/i.test(text)) {
  return card('I cannot reveal passwords, security codes or identity numbers. You can manage your account securely from your profile.', '/profile', 'Open profile');
 }
 const rows = async (sql, extra=[]) => (await query(sql, [user.id,...extra])).rows;
 if (mode === 'ticket' || ticketIntent(text)) {
  const detail = mode === 'ticket' ? text : text.replace(/^.*?\b(ticket|complaint|support request)\b[\s:,.!-]*/i, '').trim();
  if (detail.length < 10) return {handled:true, text:'Please describe the problem you want support to investigate. Do not include passwords, PINs or security codes.', needsDetails:true};
  const location = (await rows('SELECT s.state_name AS state, u.preferred_lga_name AS lga FROM users u LEFT JOIN states s ON s.id = u.preferred_state_id WHERE u.id = $1'))[0] || {};
  return card('Review your support request below. Select “Submit ticket” to send it to our support team.\n\n' + detail, '/support', 'Open support', {ticketDraft:{subject:('Chat assistance: '+detail).slice(0,255),description:detail,priority:/\burgent\b/i.test(detail)?'high':'medium',category:/\b(pay\w*|refund\w*|wallet|withdraw\w*)\b/i.test(detail)?'payment':/\b(transport\w*|moving)\b/i.test(detail)?'transportation':/\b(fumigation|cleaning)\b/i.test(detail)?'fumigation_cleaning':/\b(account|login|password|verification)\b/i.test(detail)?'account':'general',state:location.state || undefined,lga:location.lga || undefined}});
 }
 const topic = ownQuestion(text) ? TOPICS.find(([,pattern])=>pattern.test(text))?.[0] : null;
 const followup = /^(why|what about|tell me more|and|when|which|what happened|show me more)\b/i.test(text);
 const selected = topic || (followup && TOPICS.some(([key])=>key===previousTopic) ? previousTopic : null);
 if (!selected) {
  if (ownQuestion(text)) return card('I do not have a verified answer to that question. I can check your wallet, payments, withdrawals, profile, verification, subscription, coverage, properties, applications, bookings, savings, disputes and support tickets. To report a problem, type “Create a ticket” followed by the details.', '/support', 'Open support');
  return {handled:false};
 }
 const reply = (text, link, label) => card(text, link, label, {topic:selected});
 if (selected === 'profile' || selected === 'verification' || selected === 'subscription') {
  const p=(await rows('SELECT full_name, email, phone, user_type, identity_verified, identity_verification_status, subscription_active, subscription_expires_at FROM users WHERE id = $1'))[0];
  if(!p) throw new Error('Account record unavailable');
  if(selected==='profile')return reply('Your account: '+clean(p.full_name)+'\nRole: '+p.user_type+'\nEmail: '+clean(p.email)+'\nPhone: '+clean(p.phone),'/profile','Open profile');
  if(selected==='verification')return reply('Your identity verification: '+(p.identity_verified?'verified':clean(p.identity_verification_status)||'not yet verified')+'. Review your profile for any requested changes. I cannot approve verification or infer a rejection reason that is not recorded.','/profile','Review verification');
  const active=p.subscription_active && p.subscription_expires_at && new Date(p.subscription_expires_at)>new Date();
  return reply('Your subscription is '+(active?'active':'not currently active')+(p.subscription_expires_at?' (recorded expiry: '+new Date(p.subscription_expires_at).toISOString().slice(0,10)+')':'')+'.','/subscribe','Manage subscription');
 }
 if(selected==='wallet') {
  const w=(await rows('SELECT balance, reserved_balance FROM wallets WHERE user_id = $1 LIMIT 1'))[0]||{};
  return reply('Your recorded wallet balance is '+money(w.balance)+'. Reserved amount: '+money(w.reserved_balance)+'. Withdrawal eligibility can also depend on rent deductions, holds and account checks; open your dashboard for the current withdrawal quote.','/dashboard','Open wallet on dashboard');
 }
 if(selected==='coverage') {
  const paid=await rows("SELECT id FROM payments WHERE user_id = $1 AND payment_type = 'lawyer_access_fee' AND payment_status = 'completed' LIMIT 1");
  return reply(paid.length?'Your paid assistance coverage is active. You can submit a private assistance request.':'I found no completed assistance coverage payment on your account. Paid coverage is required before submitting an assistance request.','/assistance','Open coverage assistance');
 }
 let sql, link, label, heading, format;
 const params=[];
 switch(selected) {
  case 'withdrawals':
   sql='SELECT id, amount, status, requested_at FROM withdrawal_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 5';link='/dashboard';label='Open wallet';heading='Your five most recent withdrawal requests';format=r=>'#'+r.id+': '+money(r.amount)+' — '+clean(r.status);break;
  case 'refunds':
   sql=user.user_type==='tenant'?'SELECT id, amount, status FROM refund_requests WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5':'SELECT id, amount, status FROM refund_requests WHERE landlord_id = $1 ORDER BY created_at DESC LIMIT 5';link='/dashboard';label='Open refund requests on dashboard';heading='Your five most recent refund requests';format=r=>'#'+r.id+': '+money(r.amount)+' — '+clean(r.status);break;
  case 'payments':
   sql='SELECT id, amount, payment_type, payment_status, transaction_reference FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5';link='/payment-history';label='Open payment history';heading='Your five most recent payments';format=r=>'#'+r.id+': '+money(r.amount)+' — '+clean(r.payment_type)+' — '+clean(r.payment_status)+(r.transaction_reference?' ('+clean(r.transaction_reference)+')':'');break;
  case 'properties':
   if(user.user_type==='landlord') {sql='SELECT id, title, is_verified, is_available FROM properties WHERE landlord_id = $1 ORDER BY created_at DESC LIMIT 5';format=r=>clean(r.title)+' — '+(r.is_verified?'verified':'not yet verified')+' — '+(r.is_available?'available':'unavailable');link='/my-properties';}
   else {sql='SELECT p.title, a.status FROM applications a JOIN properties p ON p.id = a.property_id WHERE a.tenant_id = $1 ORDER BY a.created_at DESC LIMIT 5';format=r=>clean(r.title)+' — '+clean(r.status);link='/applications';}
   label=user.user_type==='landlord'?'Manage my properties':'Open my applications';heading=user.user_type==='landlord'?'Your five most recent property listings':'Your five most recent property applications (an application alone does not establish a tenancy)';break;
  case 'applications':
   sql=user.user_type==='tenant'?'SELECT a.id, a.status, p.title FROM applications a JOIN properties p ON p.id = a.property_id WHERE a.tenant_id = $1 ORDER BY a.created_at DESC LIMIT 5':'SELECT a.id, a.status, p.title FROM applications a JOIN properties p ON p.id = a.property_id WHERE p.landlord_id = $1 ORDER BY a.created_at DESC LIMIT 5';link='/applications';label='Open applications';heading='Your five most recent property applications';format=r=>'#'+r.id+' '+clean(r.title)+' — '+clean(r.status);break;
  case 'savings':
   if(user.user_type!=='tenant')return reply('Rent savings plans are available through the tenant account workflow. For an issue with your landlord account, contact support.','/support','Open support');
   sql='SELECT id, total_saved, target_savings_amount, status FROM rent_savings_plans WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5';link='/dashboard';label='Open rent savings on dashboard';heading='Your five most recent rent savings plans';format=r=>'#'+r.id+': '+money(r.total_saved)+' saved of '+money(r.target_savings_amount)+' — '+clean(r.status);break;
  case 'transport': case 'cleaning': {
   const table=selected==='transport'?'transportation_bookings':'fumigation_cleaning_bookings';
   sql='SELECT id, booking_date, booking_status, payment_status FROM '+table+' WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5';link=selected==='transport'?'/transportation/bookings':'/fumigation-cleaning/bookings';label='Open bookings';heading='Your five most recent '+(selected==='transport'?'transport':'fumigation and cleaning')+' bookings';format=r=>'#'+r.id+' — '+clean(r.booking_status)+' — payment '+clean(r.payment_status);break;
  }
  case 'tickets':sql='SELECT id, subject, status FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5';link='/support';label='Open my tickets';heading='Your five most recent support tickets';format=r=>'#'+r.id+' '+clean(r.subject)+' — '+clean(r.status);break;
  case 'disputes':sql='SELECT id, title, status FROM disputes WHERE opened_by = $1 OR against_user = $1 ORDER BY created_at DESC LIMIT 5';link='/my-disputes';label='Open my disputes';heading='Your five most recent disputes';format=r=>'#'+r.id+' '+clean(r.title)+' — '+clean(r.status);break;
 }
 const reference=text.match(/\bARH[_-][A-Z0-9_-]{3,100}\b/i)?.[0];
 if(selected==='payments' && reference){params.push(reference);sql=sql.replace(' ORDER BY',' AND transaction_reference = $2 ORDER BY');}
 sql=sql.replace(/^SELECT /,'SELECT COUNT(*) OVER() AS total, ');
 const records=await rows(sql,params);
 if(/\b(how many|total|number of)\b/i.test(text))return reply('Total matching records on your account: '+Number(records[0]?.total || 0)+'.',link,label);

 const reason=/\b(why|reason|when|how long)\b/i.test(text)?'\nThese are recorded statuses, not a confirmed explanation or completion date. If you need an investigation, type “Create a ticket” and describe the problem.':'';
 return reply(heading+':\n'+(records.length?records.map(format).join('\n'):'No records found.')+reason,link,label);
};
module.exports={createAccountAssistant, ticketIntent, ownQuestion};

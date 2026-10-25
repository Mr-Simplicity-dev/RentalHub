import {REGISTRATION_DRAFT_KEY,REGISTRATION_DRAFT_TTL,readRegistrationDraft,saveRegistrationDraft,clearRegistrationDraft} from './registrationDraft';
beforeEach(()=>window.localStorage.clear());
test('registration draft restores ordinary account/support/location details across page visits',()=>{
 const form={user_type:'landlord',full_name:'Returning Landlord',email:'person@example.test',phone:'08012345678',lawyer_email:'lawyer@example.test',state_id:12,lga_name:'Ikeja',add_agent:true,agent_full_name:'Agent Name'};
 expect(saveRegistrationDraft(form,2,1000)).toBe(true);expect(readRegistrationDraft(1001)).toEqual({form:{...form,state_id:'12'},step:2});
});
test('passwords, identity numbers, tokens, payment state and consent are never persisted',()=>{
 saveRegistrationDraft({full_name:'User',password:'PrivatePassword1!',confirm_password:'PrivatePassword1!',nin:'12345678901',international_passport_number:'PRIVATE123',turnstile_token:'secret-token',otp:'123456',token:'session',payment_status:'paid',termsAccepted:true,user_type:'super_admin'},4,1000);
 const raw=window.localStorage.getItem(REGISTRATION_DRAFT_KEY);const saved=JSON.parse(raw);expect(Object.keys(saved.form)).toEqual(['full_name']);expect(readRegistrationDraft(1001).step).toBe(3);
 expect(raw).not.toMatch(/PrivatePassword|PRIVATE123|secret-token|12345678901|123456|session|paid|super_admin|termsAccepted/);
});
test('expired drafts are cleared after 24 hours',()=>{saveRegistrationDraft({email:'person@example.test'},2,1000);expect(readRegistrationDraft(1000+REGISTRATION_DRAFT_TTL)).toBeNull();expect(window.localStorage.getItem(REGISTRATION_DRAFT_KEY)).toBeNull();});
test('corrupt/future drafts fail safely without preventing registration',()=>{window.localStorage.setItem(REGISTRATION_DRAFT_KEY,'broken-json');expect(readRegistrationDraft()).toBeNull();saveRegistrationDraft({full_name:'Name'},2,2000);expect(readRegistrationDraft(1000)).toBeNull();});
test('draft can be explicitly removed when registration completes or user clears it',()=>{saveRegistrationDraft({full_name:'Name'},2);clearRegistrationDraft();expect(readRegistrationDraft()).toBeNull();});
test('empty initial forms do not overwrite the device with meaningless drafts',()=>{expect(saveRegistrationDraft({user_type:'tenant',full_name:'',referral_code:'CODE'},1)).toBe(false);expect(readRegistrationDraft()).toBeNull();});

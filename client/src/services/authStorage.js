import { jwtDecode } from 'jwt-decode';
let accessToken=null,csrfToken=null,user=null,original=null,generation=0;
const legacyKeys=['token','user','impersonation_original_token','impersonation_original_user'];
const removeLegacyCredentials=()=>{
 if(typeof window==='undefined')return;
 for(const name of ['sessionStorage','localStorage']){try{const store=window[name];for(const key of legacyKeys)store.removeItem(key);if(name==='sessionStorage')for(const key of Object.keys(store))if(key.startsWith('rentalhub.registration-proof:'))store.removeItem(key);}catch{}} 
};
removeLegacyCredentials();
export const authGeneration=()=>generation;
export const beginAuthTransition=()=>{generation++;};
export const setAuthToken=token=>{
 const changed=accessToken!==token;accessToken=token||null;
 if(changed&&typeof window!=='undefined')window.dispatchEvent(new Event('rentalhub:access-token-changed'));
};
export const getAuthToken=()=>accessToken;
export const setCsrfToken=token=>{csrfToken=token||null;};
export const getCsrfToken=()=>csrfToken;
export const setAuthSession=(token,value)=>{setAuthToken(token);setAuthUser(value);removeLegacyCredentials();};
export const setAuthUser=value=>{const changed=user?.id!==value?.id;user=value||null;if(changed&&typeof window!=='undefined')window.dispatchEvent(new Event('rentalhub:account-changed'));};
export const getAuthUser=()=>user;
export const clearAuthSession=()=>{generation++;accessToken=null;csrfToken=null;setAuthUser(null);original=null;removeLegacyCredentials();};
export const setImpersonationOriginalSession=(token,value)=>{original=token&&value?{token,user:value}:null;};
export const getImpersonationOriginalSession=()=>original;
export const clearImpersonationOriginalSession=()=>{original=null;};
export const isImpersonatingSession=()=>{try{return jwtDecode(accessToken).impersonation===true;}catch{return false;}};

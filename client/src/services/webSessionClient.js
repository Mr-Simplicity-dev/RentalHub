import { createTabIdentity } from './tabIdentity.cjs';
import { getAuthToken, getCsrfToken, setAuthToken, setCsrfToken, authGeneration } from './authStorage';
let identity;
const lifecycle=()=>identity||(identity=createTabIdentity(window));
export const initializeWebSession=()=>lifecycle().initialize();
export const getWebSessionId=()=>lifecycle().get();
export const resetWebSession=()=>lifecycle().reset();
export const webSessionHeaders=async()=>{
 const id=await initializeWebSession();const token=getAuthToken(),csrf=getCsrfToken();
 return {'X-RentalHub-Session-Id':id,...(token?{Authorization:'Bearer '+token}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})};
};
export const adoptWebSession=async data=>{
 if(!data?.web_session_id)return false;
 if(typeof data.token!=='string'||typeof data.csrf_token!=='string')throw Error('Incomplete sign-in response.');
 const generation=authGeneration(), previousId=getWebSessionId();
 await lifecycle().replace(data.web_session_id,()=>authGeneration()===generation && getWebSessionId()===previousId);
 if(authGeneration()!==generation || getWebSessionId()!==data.web_session_id)throw Error('Sign-in changed while the request was running.');
 setCsrfToken(data.csrf_token);setAuthToken(data.token);
 return true;
};

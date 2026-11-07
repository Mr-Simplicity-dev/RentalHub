const legacy = require('./phoneNumberFilter');
const WORD_DIGITS = {zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',sifili:'0',daya:'1','ɗaya':'1',biyu:'2',uku:'3',hudu:'4',biyar:'5',shida:'6',bakwai:'7',takwas:'8',tara:'9',odo:'0',okan:'1',meji:'2',meta:'3',merin:'4',marun:'5',mefa:'6',meje:'7',mejo:'8',mesan:'9',efu:'0',otu:'1',abuo:'2',ato:'3',ano:'4',ise:'5',isii:'6',asaa:'7',asato:'8',itoolu:'9',un:'1',une:'1',deux:'2',trois:'3',quatre:'4',cinq:'5',sept:'7',huit:'8',neuf:'9','ноль':'0','один':'1','два':'2','три':'3','четыре':'4','пять':'5','шесть':'6','семь':'7','восемь':'8','девять':'9','صفر':'0','واحد':'1','اثنان':'2','اثنين':'2','ثلاثة':'3','اربعة':'4','خمسة':'5','ستة':'6','سبعة':'7','ثمانية':'8','تسعة':'9'};
const normalize = value => String(value || '').normalize('NFKC').replace(/[\p{Cf}\uFE0F\u20E3]/gu,'').replace(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F]/g,c=>String(c.charCodeAt(0)-(c>='\u0966'?'\u0966'.charCodeAt(0):c>='\u06F0'?'\u06F0'.charCodeAt(0):'\u0660'.charCodeAt(0)))).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const decodeWords = text => normalize(text).replace(/[零〇一二两三四五六七八九]/g,c=>({'零':'0','〇':'0','一':'1','二':'2','两':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9'})[c]).replace(/[\p{L}]+/gu,word=>WORD_DIGITS[word] ?? word);
const fragment = text => {const value=decodeWords(text).trim();return /^[\d\s()+.\-]{1,35}$/.test(value) && /\d/.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value) ? (value.startsWith('+')?'+':'')+value.replace(/\D/g,'') : '';};
const hasPhone = value => {
 const text=decodeWords(value);
 if(legacy.detectPhoneNumber(text).detected)return true;
 for(const match of text.matchAll(/(?:\+?\d[\d\s().\-]{7,35}\d)/g)){
  const raw=match[0].trim(),digits=raw.replace(/\D/g,'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)||/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(raw))continue;
  if((/^0[789]\d{9}$/.test(digits)||/^234[789]\d{9}$/.test(digits)||/^\+/.test(raw)&&digits.length>=9&&digits.length<=15||/^\d{10,15}$/.test(raw)))return true;
 }
 return false;
};
const inspect = (value,history=[]) => {
 const text=normalize(value),emailText=text.replace(/\s*(?:\[at\]|\(at\)|\bat\b)\s*/g,'@').replace(/\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*/g,'.');
 if(/[^\s@<>()\[\]]+\s*@\s*[^\s@.]+(?:\s*\.\s*[^\s@.]+)+/u.test(emailText))return {blocked:true,reason:'email'};
 const secretRequest=/(?:send|share|give|provide|tell|enter)\b.{0,35}\b(?:password|otp|pin|cvv|verification code|authenticator code)\b/i.exec(text);
 if(secretRequest&&!/(?:do not|don't|never)\s*$/.test(text.slice(Math.max(0,secretRequest.index-15),secretRequest.index)))return{blocked:true,reason:'credential_request'};
 if(hasPhone(text))return {blocked:true,reason:'phone'};
 const tail=fragment(text);
 if(tail){const parts=[...history.slice(-5).map(fragment),tail].filter(Boolean);for(let start=0;start<parts.length-1;start++)if(/^(?:0[789]|234|\+)/.test(parts.slice(start).join(''))&&hasPhone(parts.slice(start).join('')))return{blocked:true,reason:'split_phone'};}
 for(const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]+|\b(?:[a-z0-9-]{1,63}\.){1,10}[a-z\p{L}]{2,24}\b(?:\/[^\s<>]*)?/giu)){
  let url;try{url=new URL(match[0].startsWith('http')?match[0]:'https://'+match[0]);}catch{return{blocked:true,reason:'external_link'};}
  if(url.hostname!=='rentalhub.com.ng'&&!url.hostname.endsWith('.rentalhub.com.ng'))return{blocked:true,reason:'external_link'};
 }
 if(/\b(?:mailto|tel|sms):|\b(?:whatsapp|telegram|instagram|facebook)\s*(?:me|number|handle|at|@)|\b(?:pay|transfer|send money)\s+(?:me\s+)?(?:direct(?:ly)?|outside)|\b(?:my|personal)\s+bank\s+account/i.test(text))return{blocked:true,reason:'off_platform'};
 return {blocked:false};
};
module.exports={normalize,fragment,inspect,hasPhone};

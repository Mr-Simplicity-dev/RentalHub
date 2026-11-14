const {parseDocument}=require('htmlparser2');
const {escapeHtml}=require('./seoHtmlRenderer');
const {getFrontendUrl}=require('./frontendUrl');
const allowed=new Set(['p','h2','h3','h4','ul','ol','li','strong','em','blockquote','br','code','pre','a']);
function renderArticleBody(value){const source=String(value||'');if(!/<[a-z][^>]*>/i.test(source))return source.split(/\n\s*\n/).filter(Boolean).map(p=>'<p>'+escapeHtml(p)+'</p>').join('');const render=node=>{if(node.type==='text')return escapeHtml(node.data);if(['script','style'].includes(node.name))return '';const children=(node.children||[]).map(render).join(''),name=node.name==='h1'?'h2':node.name;if(!allowed.has(name))return children;if(name==='br')return '<br>';if(name==='a'){try{const u=new URL(node.attribs?.href||'',getFrontendUrl());if(u.protocol!=='https:'||u.username||u.password)return children;return '<a href="'+escapeHtml(u.href)+'" rel="noopener noreferrer">'+children+'</a>';}catch{return children;}}return '<'+name+'>'+children+'</'+name+'>';};return parseDocument(source).children.map(render).join('');}
const articlePlainText=value=>{const root=parseDocument(renderArticleBody(value));const text=node=>node.type==='text'?node.data:(node.children||[]).map(text).join(' ');return text(root).replace(/\s+/g,' ').trim();};
module.exports={renderArticleBody,articlePlainText};

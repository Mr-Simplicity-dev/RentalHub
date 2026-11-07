const {spawn}=require('child_process'),path=require('path'),readline=require('readline'),crypto=require('crypto');
const root=path.resolve(__dirname,'../tools/local-face');let child=null,pending=new Map(),queue=Promise.resolve();
const stop=()=>{child?.kill();child=null;for(const job of pending.values())job.reject(Error('LOCAL_FACE_UNAVAILABLE'));pending.clear();};
const call=payload=>new Promise((resolve,reject)=>{
 if(!child){child=spawn(path.resolve(__dirname,'../.local-face-venv/bin/python'),[path.join(root,'worker.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{PATH:process.env.PATH||'',PYTHONUNBUFFERED:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'}});readline.createInterface({input:child.stdout}).on('line',line=>{if(line.length>100000)return stop();try{const message=JSON.parse(line),job=pending.get(message.id);if(job){pending.delete(message.id);job.resolve(message.result);}}catch{stop();}});child.stderr.on('data',()=>{});const own=child;child.stdin.on('error',()=>{if(child===own)stop();});child.on('error',()=>{if(child===own)stop();});child.on('exit',()=>{if(child===own)stop();});}
 const id=crypto.randomUUID(),timer=setTimeout(()=>stop(),20000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});child.stdin.write(JSON.stringify({...payload,id})+'\n');
});
const request=payload=>{const next=queue.then(()=>call(payload));queue=next.catch(()=>{});return next;};
const validEmbedding=value=>Array.isArray(value)&&value.length===128&&value.every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(value.reduce((sum,n)=>sum+n*n,0)-1)<0.01;
const similarity=(one,two)=>{if(!validEmbedding(one)||!validEmbedding(two))throw Error('INVALID_FACE_TEMPLATE');return one.reduce((sum,n,index)=>sum+n*two[index],0);};
exports.health=()=>request({operation:'health'});
exports.analyze=(buffer,spoof=true)=>request({operation:'analyze',image:buffer.toString('base64'),spoof});
exports.compare=async(one,two)=>{const a=await request({operation:'analyze',image:one.toString('base64'),spoof:false}),b=await request({operation:'analyze',image:two.toString('base64'),spoof:false});if(a.status!=='analyzed'||b.status!=='analyzed'||a.engine!==b.engine)return{status:'review_required'};const score=similarity(a.embedding,b.embedding);return{status:score>=0.55?'match':score<=0.20?'different':'review_required',confidence:score,engine:a.engine};};
exports.similarity=similarity;exports.validEmbedding=validEmbedding;exports.stop=stop;

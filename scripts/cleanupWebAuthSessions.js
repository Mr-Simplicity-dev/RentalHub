// Explicit operator tool. Defaults to a bounded, read-only count. Never runs on import.
async function main() {
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--apply'&&!/^--limit=\d+$/.test(arg)))throw Error('Use [--apply] [--limit=1..1000]');
  require('dotenv').config({quiet:true});
  const db=require('../config/middleware/database');
  try {
    const limit=Number(args.find(arg=>arg.startsWith('--limit='))?.split('=')[1]||100);
    const result=await require('../services/webAuthSessions').getService().cleanup({limit,dryRun:!args.includes('--apply')});
    console.log(JSON.stringify(result));
  } finally { await db.end(); }
}
if(require.main===module)main().catch(()=>{console.error('Session cleanup failed. No credentials are printed.');process.exitCode=1;});

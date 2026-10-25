const cron=require('node-cron');
const logger=require('../config/utils/logger');
const {processQueue}=require('../services/propertyAlertDeliveryService');
let running=false;
exports.startPropertyAlertDeliveryJobs=()=>cron.schedule('* * * * *',async()=>{if(running)return;running=true;try{await require('../config/utils/propertyAlertService').recoverPendingPropertyNotifications();await processQueue();}catch(error){logger.error('Property alert delivery worker failed',{code:error.code || 'delivery_failed'});}finally{running=false;}});

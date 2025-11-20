const cron = require('node-cron');
const { checkExpiredSubscriptions, checkExpiredListings } = require('../utils/paymentUtils');

// Run every day at midnight to check expired subscriptions and listings
exports.startPaymentJobs = () => {
  
  // Check expired subscriptions daily at 00:00
  cron.schedule('0 0 * * *', async () => {
    console.log('Running expired subscriptions check...');
    await checkExpiredSubscriptions();
  });

  // Check expired listings daily at 00:30
  cron.schedule('30 0 * * *', async () => {
    console.log('Running expired listings check...');
    await checkExpiredListings();
  });

  console.log('✅ Payment cron jobs started');
};

const cron = require('node-cron');
const { expireProperties } = require('../utils/propertyUtils');

// Add to existing payment jobs
exports.startPropertyJobs = () => {
  
  // Check expired properties daily at 01:00
  cron.schedule('0 1 * * *', async () => {
    console.log('Running expired properties check...');
    await expireProperties();
  });

  console.log('✅ Property cron jobs started');
};
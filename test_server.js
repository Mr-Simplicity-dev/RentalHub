// Test script to check server endpoints
const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testEndpoints() {
  console.log('Testing server endpoints...\n');
  
  try {
    // Test 1: Check if server is running
    console.log('1. Testing server health...');
    const healthRes = await axios.get(`${API_BASE}/health`);
    console.log(`   ✓ Server health: ${healthRes.status} ${healthRes.statusText}`);
  } catch (err) {
    console.log(`   ✗ Server health check failed: ${err.message}`);
  }
  
  try {
    // Test 2: Check payments/banks endpoint
    console.log('\n2. Testing /payments/banks endpoint...');
    const banksRes = await axios.get(`${API_BASE}/payments/banks`);
    console.log(`   ✓ Banks endpoint: ${banksRes.status} ${banksRes.statusText}`);
    console.log(`   ✓ Response: ${JSON.stringify(banksRes.data)}`);
  } catch (err) {
    console.log(`   ✗ Banks endpoint failed: ${err.message}`);
    if (err.response) {
      console.log(`   ✗ Status: ${err.response.status}`);
      console.log(`   ✗ Data: ${JSON.stringify(err.response.data)}`);
    }
  }
  
  try {
    // Test 3: Check wallet/fund endpoint (without auth)
    console.log('\n3. Testing /payments/wallet/fund endpoint...');
    const fundRes = await axios.post(`${API_BASE}/payments/wallet/fund`, {
      amount: 1000
    });
    console.log(`   ✓ Wallet fund endpoint: ${fundRes.status} ${fundRes.statusText}`);
  } catch (err) {
    console.log(`   ✗ Wallet fund endpoint failed: ${err.message}`);
    if (err.response) {
      console.log(`   ✗ Status: ${err.response.status}`);
      console.log(`   ✗ Data: ${JSON.stringify(err.response.data)}`);
    }
  }
  
  console.log('\nTest completed.');
}

testEndpoints().catch(console.error);
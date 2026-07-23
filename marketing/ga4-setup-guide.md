# Google Analytics 4 (GA4) Setup Guide

## What you need to do

### Step 1: Create a Google Analytics account
1. Go to https://analytics.google.com
2. Sign in with your Google account
3. Click **Admin** (gear icon, bottom-left)
4. Click **+ Create Property**
5. Fill in:
   - **Property name:** RentalHub NG
   - **Reporting time zone:** Africa/Lagos
   - **Currency:** Nigerian Naira (₦)
6. Click **Next**
7. Choose **Web** as the platform
8. Fill in:
   - **Website URL:** rentalhub.com.ng
   - **Stream name:** RentalHub Web
9. Click **Create stream**
10. You'll see your **Measurement ID** — it looks like `G-XXXXXXXXXX`
11. Copy that ID

### Step 2: Replace the placeholder in your code
In `client/public/index.html`, find the two places that say `G-XXXXXXXXXX` and replace them with your real Measurement ID.

### Step 3: Deploy
Run `npm run build` in the `client/` folder and deploy the build to your server.

### Step 4: Verify it's working
1. Open `rentalhub.com.ng/download?utm_source=test&utm_medium=test&utm_campaign=test`
2. Open https://analytics.google.com → your property → Realtime
3. You should see 1 active user from your visit

---

## What you'll see in the dashboard

After your ads start running:

- **Traffic Acquisition report** → Shows which UTM source brought the most visitors
  - e.g., `facebook` vs `instagram` vs `tiktok`
- **Conversions** → Set up "sign_up" as a conversion event to see which platform drives the most registrations
- **Realtime** → See live visitors right now

---

## Optional: Set up conversion tracking

After GA4 is live, to track sign-ups as conversions:

1. Go to **Admin** → **Events**
2. Find the `sign_up` event (GA4 auto-tracks this when someone registers)
3. Toggle **Mark as conversion** ON

Now you'll see a Conversions report showing which UTM source drives the most sign-ups.

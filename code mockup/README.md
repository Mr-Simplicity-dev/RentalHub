# Code Mockups — Device Frames

## What's in this folder

| File | Device | Best For |
|---|---|---|
| `phone-mockup.html` | iPhone-style phone | App download banners, social media ads |
| `tablet-mockup.html` | iPad-style tablet | Property listing showcases |
| `laptop-mockup.html` | MacBook-style laptop | Website screenshots |
| `monitor-mockup.html` | Desktop monitor | Website/dashboard screenshots |
| `all-devices-mockup.html` | All 4 together | "Available on all devices" banners |

## How to Use

### Step 1: Get Your Screenshot
- **App screenshot:** Open RentalHub app on your phone → take a screenshot
- **Website screenshot:** Open rentalhub.com.ng on your laptop → press `PrtScn` or use Snipping Tool

### Step 2: Add Screenshot to the Mockup
1. Save your screenshot as `screenshot.png` in this folder
2. Open the mockup HTML file in a text editor (Notepad, VS Code)
3. Find the `<div class="placeholder">...</div>` section
4. Replace the entire placeholder div with:
   ```html
   <img src="screenshot.png" alt="RentalHub" class="placeholder-img" />
   ```
5. Save the file

### Step 3: Generate the Image
1. Open the HTML file in your browser (double-click it)
2. You'll see your screenshot inside a device frame
3. Press `PrtScn` to screenshot it, OR
4. Right-click → "Inspect" → click the device toolbar → screenshot at exact size

### Step 4: Use in Banners
- Open the banner folder `D:\New folder\tenant site\banner\`
- Use these mockup images as the centerpiece of your Canva banners
- Or use them directly in social media posts

## Quick Tip
You can also use these mockups to:
- Show your app on the download page (`/download`)
- Add to your website's "Download the App" section
- Create presentations or pitch decks
- Print on marketing materials

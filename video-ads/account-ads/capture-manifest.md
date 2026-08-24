# Real-screen capture manifest

Capture each item after the app has rendered normally. Use the same demo account and a clean state for every platform.

| ID | Platform | Route / screen to capture | Required for |
| --- | --- | --- | --- |
| A1 | Android | Welcome or Register | Tenant + Landlord |
| A2 | Android | Account role choice with Tenant selected | Tenant |
| A3 | Android | Account role choice with Landlord selected | Landlord |
| A4 | Android | Registration details with Adam Hawa demo data | Tenant + Landlord |
| A5 | Android | Tenant search/home with sample listing | Tenant |
| A6 | Android | Landlord dashboard or start-listing screen with sample property | Landlord |
| W1 | Web | Tenant search/home at desktop width | Tenant |
| W2 | Web | Landlord dashboard or start-listing screen at desktop width | Landlord |
| I1–I6 | iPhone | Repeat A1–A6 only after a real iOS build runs | Optional iOS edit |

## Safe data rules

* Name: **Adam Hawa**
* Email: `adam.hawa@example.com`
* Phone: `0800 000 0000`
* Never capture passwords, NIN/passport values, payment methods, access tokens, actual contact details, messages, documents, or a real occupied property address.
* If a screen cannot be populated safely, capture it empty or use a clearly labelled sample value.

## Capture quality

Android and iPhone: full native-resolution PNG, no notification bar notifications, no emulator chrome. Web: PNG at 1440px or wider with browser UI hidden. Keep one copy of every untouched capture; editing should use copies in the video editor.

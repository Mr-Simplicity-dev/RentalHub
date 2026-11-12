# Background jobs audit — 12 November 2026

The live RentalHub workers have PM2 IDs 2 and 3. Old checks requiring process 0 prevented some jobs from running. Other timers could run twice.

A dedicated PostgreSQL session advisory lock now elects one worker. Standby workers can take over. Jobs skip overlapping runs, record status and drain before shutdown. All eleven jobs modules and the server's additional business timers were inspected. Per-worker memory cleanup remains local. Cron schedules default to Africa/Lagos.

Live takeover proof: worker 2 stopped, worker 3 took over, one scheduler lock remained, and website health returned 200. Worker 2 was restarted. Other applications were not restarted.

Super Admin can inspect /admin/background-jobs. Its API requires authentication, Super Admin permission and MFA.

The old homepage Google Indexing API submission was replaced by sitemap verification because that API is restricted to supported JobPosting/BroadcastEvent pages. Source: https://developers.google.com/search/apis/indexing-api/v3/quickstart

WhatsApp property-match alerts still require an approved Meta template. They are not claimed delivered. Daily/weekly scheduled work was not forced early; registered means waiting for its schedule.

## Observed job inventory

| Job | Kind | Schedule | Observed status |
| --- | --- | --- | --- |
| config/utils/scheduler.js:21:interval:86400000 | interval | 86400000 | registered |
| dispute-escalation:startup | startup | once | completed |
| jobs/paymentJobs.js:102:cron:0 1 * * * | cron | 0 1 * * * | registered |
| jobs/paymentJobs.js:18:cron:0 0 * * * | cron | 0 0 * * * | registered |
| jobs/paymentJobs.js:24:cron:30 0 * * * | cron | 30 0 * * * | registered |
| jobs/paymentJobs.js:32:cron:0 7 * * * | cron | 0 7 * * * | registered |
| jobs/paymentJobs.js:41:cron:15 1 * * * | cron | 15 1 * * * | registered |
| jobs/paymentJobs.js:56:cron:0 8 * * 1 | cron | 0 8 * * 1 | registered |
| jobs/paymentJobs.js:81:cron:*/10 * * * * | cron | */10 * * * * | registered |
| jobs/premblyRecoveryJobs.js:37:startup:10000 | startup | 10000 | completed |
| jobs/premblyRecoveryJobs.js:39:interval:60000 | interval | 60000 | completed |
| jobs/propertyAlertDeliveryJobs.js:5:cron:* * * * * | cron | * * * * * | completed |
| jobs/propertyTourJobs.js:152:interval:120000 | interval | 120000 | completed |
| jobs/propertyTourJobs.js:157:startup:45000 | startup | 45000 | completed |
| jobs/recruitmentJobs.js:290:cron:15 0 * * * | cron | 15 0 * * * | registered |
| jobs/recruitmentJobs.js:291:cron:*/5 * * * * | cron | */5 * * * * | registered |
| jobs/registrationReminderJobs.js:227:interval:3600000 | interval | 3600000 | registered |
| jobs/rentSavingsJobs.js:144:cron:0 9 1 * * | cron | 0 9 1 * * | registered |
| jobs/rentSavingsJobs.js:150:cron:0 8 * * * | cron | 0 8 * * * | registered |
| jobs/rentSavingsJobs.js:156:startup:10000 | startup | 10000 | completed |
| jobs/smsDeliveryJobs.js:33:cron:* * * * * | cron | * * * * * | completed |
| jobs/smsDeliveryJobs.js:34:startup:15000 | startup | 15000 | completed |
| jobs/smsMarketingJobs.js:95:cron:* * * * * | cron | * * * * * | completed |
| jobs/supportReassignJobs.js:31:interval:20000 | interval | 20000 | completed |
| jobs/supportReassignJobs.js:33:startup:15000 | startup | 15000 | completed |
| jobs/whatsappMarketingJobs.js:175:cron:* * * * * | cron | * * * * * | completed |
| registration-reminders:startup | startup | once | completed |
| routes/support.js:1353:interval:300000 | interval | 300000 | registered |
| routes/support.js:1355:startup:30000 | startup | 30000 | completed |
| server.js:216:cron:0 */6 * * * | cron | 0 */6 * * * | registered |
| server.js:248:cron:*/10 * * * * | cron | */10 * * * * | registered |
| server.js:275:cron:0 1 * * * | cron | 0 1 * * * | registered |
| server.js:379:cron:0 2 * * * | cron | 0 2 * * * | registered |
| services/conductPaymentService.js:89:interval:60000 | interval | 60000 | completed |
| services/conductPaymentService.js:91:startup:30000 | startup | 30000 | completed |

## Release checks

Backend: 152 passed. Web: 159 passed. Job tests: 7 passed. Local and VPS frontend builds passed. Migrations 2045–2047 applied. Backup: /var/backups/rentalhub/release-1.0.61-20261111T233703312Z. Source was deployed from a checked file manifest; VPS Git history was not rewritten.

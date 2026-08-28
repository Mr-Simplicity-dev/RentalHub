# Undone Items (tracked list)

> Ask the AI: "bring the undone items" to see this list.

## Active

- [ ] **Verify Resend domain `rentalhub.com.ng` on Resend (DNS records)** — domain status is "failed"; ALL emails from the app (welcome, receipts, payouts, failed-payment + registration reminders) are rejected with 403. Action: add Resend SPF/DKIM/return-path DNS records in Cloudflare for rentalhub.com.ng, then click Verify in Resend dashboard. No code change needed.

- [ ] **Language pack: remaining hardcoded-English files** — 124 files without i18n found. DONE so far: AppLanding, QrCodePage, Terms, Privacy (full), RentSavingsModal (receipt link). Remaining batches:
  - Public/marketing: (none left — Home/NigeriaPage/Pricing/HowItWorks/MobileAppPage already translated)
  - User-facing components: WalletFundModal, WalletWithdrawModal, damage/* (DamageReportCard, DamageReportCapture, DamageReportButton, DamageReportPreview), properties/* (PropertyCard, PropertyFilters, PropertyList, PropertyShareButton, LivePropertyPhotoCapture), DisputeCreationModal, DisputeQRCode, MapPicker, fumigation/* (FumigationCleaningCatalog, FumigationCleaningWizard, FumigationCleaningAdmin, DashboardButton), calls/*, common/* (ConfirmDialog, InputDialog, Modal, ShareMenu, LivePassportCaptureModal, BookingCancelModal, AppealModal, InternalNotesPanel, RoleBadge, ApprovalTimeline, SupportReplyActionModal, TicketConversationModal)
  - Admin suite (admin dashboards + ~60 admin/* components): SuperAdminDashboard, AdminDashboard, AdminUsers, AdminProperties, AdminAgentManagement, AdminApplications, AdminApplicationDetail, AdminCompliance, AdminEvidenceVerifications, AdminInspections, AdminLawyerInvites, AdminLedger, AdminPropertyDetail, AdminUserDetail, AdminVerifications, FinancialAdminDashboard, StateAdminDashboard, SuperFinancialAdminDashboard, SuperSupportAdminDashboard, StateSupportAdminDashboard, LgaSupportAdminDashboard, RecruitmentAdminDashboard, TransportationAdminDashboard, TransportationAdminStateDashboard, TransportationSuperAdminDashboard, Fumigation admin dashboards + all components/admin/*

- [ ] **Withdrawal security enhancement (suggested)** — withdrawals currently have NO 2FA/OTP step (only JWT + rate limit + bank-name match + admin approval). Consider adding phone OTP or email code confirmation before a withdrawal request is submitted.

## Inbox

- (empty)

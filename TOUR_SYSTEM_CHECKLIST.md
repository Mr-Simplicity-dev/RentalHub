# Tour System Implementation Checklist

## ✅ Completed

- [x] Tour Context (`TourContext.jsx`) - Manages tour state and logic
- [x] Tour Hook (`useTour.js`) - Custom hook for accessing tour state
- [x] Tour Configuration (`tourConfig.js`) - All tour steps for each dashboard
- [x] Welcome Modal Component (`WelcomeModal.jsx`) - First-stage onboarding
- [x] Tour Overlay Component (`TourOverlay.jsx`) - Step-by-step guided tour
- [x] Tour Manager Component (`TourManager.jsx`) - Orchestrates tour flow
- [x] App Integration - Wrapped app with TourProvider and added TourManager
- [x] Integration Guide (`TOUR_INTEGRATION_GUIDE.md`) - Developer documentation

## 📋 TODO - Per Dashboard Integration

### Tenant/User Dashboard
- [ ] Add CSS classes to dashboard sections:
  - `.dashboard-properties-section`
  - `.dashboard-bookings-section`
  - `.dashboard-earnings-section`
  - `.dashboard-analytics-section`
  - `.dashboard-messages-section`

### Agent Dashboard  
- [ ] Add CSS classes to agent dashboard sections:
  - `.agent-commissions-section`
  - `.agent-bookings-section`
  - `.agent-earnings-section`
  - `.agent-profile-section`
- [ ] Test tour with agent user type

### Lawyer Dashboard
- [ ] Add CSS classes to lawyer dashboard sections:
  - `.lawyer-cases-section`
  - `.lawyer-evidence-section`
  - `.lawyer-clients-section`
  - `.lawyer-earnings-section`

### Admin Dashboard
- [ ] Add CSS classes to admin dashboard sections:
  - `.admin-users-section`
  - `.admin-properties-section`
  - `.admin-disputes-section`
  - `.admin-payments-section`
  - `.admin-reports-section`

### Financial Admin Dashboard
- [ ] Add CSS classes to financial admin sections:
  - `.fin-admin-payments-section`
  - `.fin-admin-settlements-section`
  - `.fin-admin-refunds-section`
  - `.fin-admin-reports-section`

### Transportation Admin Dashboard
- [ ] Add CSS classes to transportation sections:
  - `.trans-admin-bookings-section`
  - `.trans-admin-routes-section`
  - `.trans-admin-drivers-section`
  - `.trans-admin-revenue-section`

### Fumigation Admin Dashboard
- [ ] Add CSS classes to fumigation sections:
  - `.fum-admin-bookings-section`
  - `.fum-admin-services-section`
  - `.fum-admin-providers-section`
  - `.fum-admin-payments-section`

### Recruitment Admin Dashboard
- [ ] Add CSS classes to recruitment sections:
  - `.rec-admin-jobs-section`
  - `.rec-admin-applications-section`
  - `.rec-admin-candidates-section`

### Super Admin Dashboard
- [ ] Add CSS classes to super admin sections:
  - `.super-admin-users-section`
  - `.super-admin-admins-section`
  - `.super-admin-platform-section`
  - `.super-admin-analytics-section`
  - `.super-admin-support-section`

## 🔧 Optional Enhancements

- [ ] Add "Replay Tour" button to user settings/profile page
- [ ] Create backend API endpoints to persist tour state in database
- [ ] Add tour analytics to track user engagement
- [ ] Create admin panel to manage/update tour content
- [ ] Add multilingual support to tour steps
- [ ] Create video/image support in tour steps
- [ ] Add tour skip survey to gather feedback
- [ ] Implement A/B testing for different tour flows

## 🧪 Testing Checklist

- [ ] Test first-time user experience (tour shows immediately)
- [ ] Test returning user within 7 days (tour hidden)
- [ ] Test returning user after 7 days (tour shows again)
- [ ] Test tour navigation (next, previous, skip buttons)
- [ ] Test tour on mobile devices
- [ ] Test tour on tablet devices
- [ ] Test tour on desktop
- [ ] Verify highlight overlay works correctly
- [ ] Verify tooltip positioning for all placements
- [ ] Test localStorage persistence
- [ ] Test with different user roles
- [ ] Verify all target elements exist in DOM

## 📝 Notes

- Tour state is currently stored in localStorage with keys: `tour_last_dismissal_{userId}`
- 7-day inactivity threshold can be modified in `TourContext.jsx`
- Tour steps can be customized in `tourConfig.js`
- All tour components use Framer Motion for animations
- Tour system is RTL-ready (works with Arabic, etc.)

## 🚀 Quick Start for Developers

1. **View existing tour structure**:
   - Check `client/src/config/tourConfig.js` for examples
   
2. **Add tour to your dashboard**:
   ```jsx
   // 1. Add CSS classes to your sections
   <section className="dashboard-properties-section">
   
   // 2. Tours automatically show for authenticated users
   // 3. Test by clearing localStorage and reloading
   ```

3. **Customize tour steps**:
   - Edit tour steps in `tourConfig.js`
   - Update target CSS selectors
   - Modify descriptions
   - Adjust tooltip placement

4. **Add replay button**:
   - Import `useTour` and `getTourStepsByUserRole`
   - Create button that calls `replayTour()`

## 📞 Support Resources

- **Integration Guide**: See `TOUR_INTEGRATION_GUIDE.md`
- **Tour Configuration**: `client/src/config/tourConfig.js`
- **Context Documentation**: `client/src/context/TourContext.jsx`
- **Component Guide**: Check JSDoc comments in components

---

**Status**: Core system complete, awaiting dashboard integration
**Maintained by**: Development Team
**Last Updated**: June 13, 2026

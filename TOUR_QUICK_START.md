# Tour System - Quick Implementation Guide

## For Dashboard Developers

This guide helps you quickly add tour support to your dashboard by wrapping sections with CSS classes.

## Simple Steps

### 1. Identify Your Dashboard Sections

Look at your dashboard and identify the main sections/containers. For example, the Tenant Dashboard has:
- Welcome section
- Stats grid (cards showing key metrics)
- Properties section
- Bookings section
- Messages section
- Analytics section

### 2. Add CSS Classes

Wrap each section with the appropriate CSS class from `tourConfig.js`. Classes are already defined for common dashboards.

**Example: Tenant Dashboard (Dashboard.jsx)**

```jsx
// BEFORE:
return (
  <div className="bg-gray-50 min-h-screen py-8">
    <div className="container mx-auto px-4">
      {/* Welcome Section */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.full_name || 'User'}
        </h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Stats cards... */}
      </div>

      {/* Properties */}
      <div className="mb-8">
        {/* Properties list/cards... */}
      </div>
    </div>
  </div>
);

// AFTER: Add tour classes
return (
  <div className="bg-gray-50 min-h-screen py-8">
    <div className="container mx-auto px-4">
      {/* Welcome Section */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.full_name || 'User'}
        </h1>
      </div>

      {/* Stats Grid - Add this class */}
      <section className="dashboard-properties-section grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Stats cards... */}
      </section>

      {/* Properties Section - Add this class */}
      <section className="dashboard-bookings-section mb-8">
        {/* Properties list/cards... */}
      </section>

      {/* Add other sections similarly */}
      <section className="dashboard-earnings-section mb-8">
        {/* Earnings content... */}
      </section>

      <section className="dashboard-analytics-section mb-8">
        {/* Analytics content... */}
      </section>

      <section className="dashboard-messages-section mb-8">
        {/* Messages content... */}
      </section>
    </div>
  </div>
);
```

## Available CSS Classes by Dashboard Type

### Tenant Dashboard Classes
```jsx
.dashboard-properties-section   // Main properties display
.dashboard-bookings-section     // Bookings/reservations
.dashboard-earnings-section     // Revenue/earnings
.dashboard-analytics-section    // Charts and metrics
.dashboard-messages-section     // Messages/communications
```

### Agent Dashboard Classes
```jsx
.agent-commissions-section      // Commission tracking
.agent-bookings-section         // Agent's bookings
.agent-earnings-section         // Agent earnings
.agent-profile-section          // Profile info
```

### Lawyer Dashboard Classes
```jsx
.lawyer-cases-section           // Active cases
.lawyer-evidence-section        // Evidence review
.lawyer-clients-section         // Client list
.lawyer-earnings-section        // Earnings
```

### Admin Dashboard Classes
```jsx
.admin-users-section            // User management
.admin-properties-section       // Property management
.admin-disputes-section         // Dispute handling
.admin-payments-section         // Payment tracking
.admin-reports-section          // Analytics/reports
```

### Financial Admin Classes
```jsx
.fin-admin-payments-section
.fin-admin-settlements-section
.fin-admin-refunds-section
.fin-admin-reports-section
```

### Transportation Admin Classes
```jsx
.trans-admin-bookings-section
.trans-admin-routes-section
.trans-admin-drivers-section
.trans-admin-revenue-section
```

### Fumigation Admin Classes
```jsx
.fum-admin-bookings-section
.fum-admin-services-section
.fum-admin-providers-section
.fum-admin-payments-section
```

### Super Admin Dashboard Classes
```jsx
.super-admin-users-section
.super-admin-admins-section
.super-admin-platform-section
.super-admin-analytics-section
.super-admin-support-section
```

## Implementation Checklist

- [ ] Identify main sections in your dashboard
- [ ] Wrap each section with `<section className="section-class">`
- [ ] Verify CSS class names match `tourConfig.js`
- [ ] Test tour by logging in as that user type
- [ ] Clear localStorage if needed: `localStorage.clear()`
- [ ] Verify all sections are highlighted correctly during tour

## Testing Your Tour

### First Time User Test:
```javascript
// In browser console:
localStorage.clear();  // Reset tour state
location.reload();     // Reload page
```
Expected: Welcome modal appears → User clicks "Start Tour" → Tour highlights all sections

### Returning User Test (7+ days):
```javascript
// Simulate 8 days ago
const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 8);
localStorage.setItem(`tour_last_dismissal_${userId}`, pastDate.toISOString());
location.reload();
```
Expected: Welcome modal appears again with "Welcome Back!" message

### Tour Navigation Test:
- Click "Next" button → highlights next section ✓
- Click "Back" button → highlights previous section ✓
- Click "Skip Tour" → tour closes ✓
- Progress bar shows current step ✓

## Example: Complete Dashboard Wrapping

```jsx
// agent/AgentDashboard.jsx
import React from 'react';

export default function AgentDashboard() {
  return (
    <div className="dashboard-container">
      {/* Commission section - Step 1 */}
      <section className="agent-commissions-section bg-white rounded-lg p-6 mb-6">
        <h2>Your Commissions</h2>
        {/* Commission cards */}
      </section>

      {/* Bookings section - Step 2 */}
      <section className="agent-bookings-section bg-white rounded-lg p-6 mb-6">
        <h2>Recent Bookings</h2>
        {/* Booking list */}
      </section>

      {/* Earnings section - Step 3 */}
      <section className="agent-earnings-section bg-white rounded-lg p-6 mb-6">
        <h2>Earnings & Withdrawals</h2>
        {/* Earnings stats */}
      </section>

      {/* Profile section - Step 4 */}
      <section className="agent-profile-section bg-white rounded-lg p-6 mb-6">
        <h2>Your Profile</h2>
        {/* Profile form */}
      </section>
    </div>
  );
}
```

## Tour Configuration

If your dashboard has different section names, you can customize them in `tourConfig.js`:

```javascript
// In tourConfig.js, update the tour steps for your role:
export const TOUR_STEPS = {
  AGENT_DASHBOARD: [
    {
      id: 'agent_1',
      target: '.agent-commissions-section',  // CSS selector
      title: 'Your Commissions',              // Step title
      description: 'Track all commissions...' // User-friendly description
      placement: 'right',                     // Tooltip position
      highlight: true,
    },
    // ... more steps
  ],
};
```

## Common Issues & Solutions

### Section Not Highlighting
**Problem**: Tour step shows but element is not highlighted
**Solution**:
- Verify CSS class name matches exactly (case-sensitive)
- Ensure element exists in DOM when tour starts
- Check element is not hidden (`display: none`)
- Use browser DevTools to inspect: `document.querySelector('.section-class')`

### Tour Not Appearing
**Problem**: Welcome modal doesn't show even on first login
**Solution**:
- Ensure user is authenticated
- Check browser console for errors
- Verify `TourProvider` is in App.jsx
- Clear localStorage: `localStorage.clear()`
- Check if user role is mapped in `tourConfig.js`

### Wrong Tour Showing
**Problem**: Seeing wrong dashboard tour for user role
**Solution**:
- Check user's role in database matches `tourConfig.js` mapping
- Verify role is mapped in `getTourStepsByUserRole()` function
- Test with different user types

## Adding Custom Tour Steps

To add a custom section not in the default list:

```javascript
// 1. Update tourConfig.js
export const TOUR_STEPS = {
  MY_CUSTOM_DASHBOARD: [
    {
      id: 'custom_1',
      target: '.my-custom-section',
      title: 'My Custom Feature',
      description: 'This is what this section does...',
      placement: 'left',
      highlight: true,
    },
  ],
};

// 2. Map your user role
export const getTourStepsByUserRole = (userRole) => {
  const roleToTourMap = {
    my_custom_role: TOUR_STEPS.MY_CUSTOM_DASHBOARD,
    // ... other roles
  };
  return roleToTourMap[userRole] || TOUR_STEPS.TENANT_DASHBOARD;
};

// 3. Add class to your component
<section className="my-custom-section">
  {/* Your content */}
</section>
```

## Performance Tips

- ✅ Use `<section>` tags for semantic HTML
- ✅ Keep tour sections large and clear
- ✅ Avoid nested sections with the same class
- ✅ Test on mobile to ensure sections are touchable
- ✅ Ensure sections are visible (not hidden behind menus)

## Need Help?

1. Check `TOUR_INTEGRATION_GUIDE.md` for detailed documentation
2. Review existing implementations in other dashboards
3. Check console for error messages
4. Test in browser DevTools with: `document.querySelector('.section-class')`

---

**Quick Links:**
- Integration Guide: `TOUR_INTEGRATION_GUIDE.md`
- Configuration: `client/src/config/tourConfig.js`
- Context: `client/src/context/TourContext.jsx`

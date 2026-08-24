# RentalHub Tour System Integration Guide

## Overview

The RentalHub tour system provides an interactive, professional onboarding experience for users across all dashboards. It uses a two-stage approach:

1. **Welcome Modal** - First impression and re-engagement trigger
2. **Overlay Tour** - Step-by-step guided walkthrough with highlight overlays

## Key Features

✅ **Smart Re-engagement**: Automatically shows tour after 7 days of inactivity
✅ **Role-based Tours**: Different tours for different user types
✅ **Replay Anytime**: Users can replay tours from settings
✅ **Professional UI**: Smooth animations and responsive design
✅ **Non-intrusive**: Doesn't block user interaction (only highlights target element)

## How It Works

### User Flow

```
User Logs In
    ↓
Check if tour should show (first time OR 7+ days inactive)
    ↓
Show Welcome Modal
    ├─ User clicks "Start Tour" → Show Overlay Tour
    └─ User clicks "Skip" → Hide modal
```

## Integration Guide

### Step 1: Verify Your Dashboard Has Target Elements

Each dashboard needs HTML elements with specific class names that the tour will highlight. The tour system looks for these classes:

**Common Dashboard Sections:**
```
.dashboard-properties-section
.dashboard-bookings-section
.dashboard-earnings-section
.dashboard-analytics-section
.dashboard-messages-section
```

**Admin Dashboard:**
```
.admin-users-section
.admin-properties-section
.admin-disputes-section
.admin-payments-section
.admin-reports-section
```

**Customize for Your Dashboard:**

If your dashboard has different section names, update the `tourConfig.js` file with matching class names.

### Step 2: Add Classes to Your Dashboard Components

Add the CSS classes to your dashboard sections:

```jsx
// Example: Dashboard.jsx

export default function Dashboard() {
  return (
    <div className="dashboard-container">
      {/* Properties Section */}
      <section className="dashboard-properties-section">
        <h2>My Properties</h2>
        {/* Property cards */}
      </section>

      {/* Bookings Section */}
      <section className="dashboard-bookings-section">
        <h2>Recent Bookings</h2>
        {/* Bookings list */}
      </section>

      {/* Earnings Section */}
      <section className="dashboard-earnings-section">
        <h2>Earnings</h2>
        {/* Earnings stats */}
      </section>

      {/* Analytics Section */}
      <section className="dashboard-analytics-section">
        <h2>Analytics</h2>
        {/* Charts */}
      </section>

      {/* Messages Section */}
      <section className="dashboard-messages-section">
        <h2>Messages</h2>
        {/* Messages */}
      </section>
    </div>
  );
}
```

### Step 3: Add "Replay Tour" Button to Settings

Add a button in the user settings or profile page that allows users to replay the tour:

```jsx
import { useTour } from '../hooks/useTour';
import { getTourStepsByUserRole } from '../config/tourConfig';

export default function SettingsPage() {
  const { replayTour } = useTour();
  const { user } = useAuth();

  const handleReplayTour = () => {
    const tourSteps = getTourStepsByUserRole(user.user_type);
    replayTour(user.user_type, tourSteps);
  };

  return (
    <div>
      {/* Other settings */}
      
      <button
        onClick={handleReplayTour}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Replay Tour
      </button>
    </div>
  );
}
```

## Customizing Tours

### Adding New Dashboard Tour Steps

Edit `client/src/config/tourConfig.js`:

```javascript
export const TOUR_STEPS = {
  // ... existing tours
  
  MY_NEW_DASHBOARD: [
    {
      id: 'my_1',
      target: '.my-section',
      title: 'Section Title',
      description: 'Clear description of what this section does and how to use it.',
      placement: 'right', // 'top', 'right', 'left', 'bottom'
      highlight: true,
    },
    {
      id: 'my_2',
      target: '.another-section',
      title: 'Another Section',
      description: 'Description here.',
      placement: 'left',
      highlight: true,
    },
  ],
};
```

### Adding a New User Role

1. Add tour steps for the role in `tourConfig.js`
2. Add mapping in `getTourStepsByUserRole()` function
3. Add mapping in `getTourDashboardType()` function

```javascript
export const getTourStepsByUserRole = (userRole) => {
  const roleToTourMap = {
    // ... existing roles
    my_new_role: TOUR_STEPS.MY_NEW_DASHBOARD,
  };
  return roleToTourMap[userRole] || TOUR_STEPS.TENANT_DASHBOARD;
};
```

### Changing Inactivity Threshold

Edit `client/src/context/TourContext.jsx`:

```javascript
const TOUR_CONFIG = {
  INACTIVITY_THRESHOLD_DAYS: 7, // Change this value
  // ...
};
```

## Tour Steps Configuration

Each tour step has these properties:

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier (e.g., 'tenant_1') |
| `target` | string | CSS selector for element to highlight |
| `title` | string | Step title shown in tooltip |
| `description` | string | Detailed description of this step |
| `placement` | string | Tooltip position: 'top', 'right', 'left', 'bottom' |
| `highlight` | boolean | Whether to highlight the target element |

## API Endpoints (Optional - Backend Integration)

For production, you may want to store tour state on the backend:

```
POST /api/tour/dismiss
  - Payload: { dashboardType, lastDismissal }
  
GET /api/tour/status
  - Returns: { shouldShowTour, lastDismissal }
  
PUT /api/tour/reset
  - Reset user's tour state (admin only)
```

Currently, tour state is stored in localStorage with user-scoped keys:
- `tour_last_dismissal_{userId}` - Last time tour was dismissed
- `tour_completed_{userId}` - Whether tour was completed

## Testing the Tour

1. **First-time user**: Log in with a new account → Tour should show immediately
2. **Returning user (within 7 days)**: Log in again → Tour should NOT show
3. **Returning user (after 7 days)**: Wait 7+ days and log in → Tour should show
4. **Replay tour**: Click "Replay Tour" button in settings → Tour should start

**Quick Testing:**
```javascript
// Clear tour state to test first-time experience
localStorage.clear();
// Then reload the page
```

## Troubleshooting

### Tour not showing
- Check that `TourProvider` wraps the entire app in `App.jsx`
- Verify user is authenticated (`useAuth()` returns user)
- Clear localStorage and test again

### Tooltip appearing in wrong position
- Make sure target element exists in DOM
- Check CSS selector is correct
- Adjust `placement` property

### Tour starting automatically every time
- Check localStorage for tour dismissal keys
- Verify `shouldShowTour()` logic in `TourContext.jsx`

### Elements not being highlighted
- Verify CSS classes match exactly (case-sensitive)
- Use browser DevTools to inspect element selectors
- Check element is visible and not `display: none`

## Components Overview

### TourContext.jsx
Main context that manages:
- Tour visibility state
- Current step tracking
- Tour steps data
- Actions: `startTour`, `nextStep`, `skipTour`, `completeTour`, `replayTour`

### useTour.js
Custom hook to access tour context:
```javascript
const { showWelcomeModal, showTourOverlay, startTour, skipTour } = useTour();
```

### tourConfig.js
Configuration file with:
- All tour steps for each dashboard
- Role-to-tour mappings
- Helper functions

### WelcomeModal.jsx
First-stage modal that:
- Shows welcome message
- Explains tour benefits
- Provides "Start Tour" and "Skip" buttons
- Indicates if user is returning

### TourOverlay.jsx
Second-stage overlay that:
- Highlights target elements
- Shows step-by-step tooltip
- Handles navigation (next, previous, skip)
- Shows progress bar

### TourManager.jsx
Orchestrator component that:
- Renders both Modal and Overlay
- Handles tour flow logic
- Triggers tour based on user role

## Best Practices

✅ Keep tour steps concise (2-3 sentences per step)
✅ Use clear, action-oriented language
✅ Group related features in consecutive steps
✅ Test tour on different screen sizes
✅ Update tour when UI changes significantly
✅ Monitor user feedback on tour effectiveness

## Support

For issues or questions about the tour system:
1. Check this guide's troubleshooting section
2. Review `tourConfig.js` for existing implementations
3. Check browser console for errors
4. Verify localStorage is enabled

---

**Last Updated:** June 2026
**Version:** 1.0

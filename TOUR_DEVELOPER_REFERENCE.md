# Tour System - Developer Reference Card

## Quick Commands

### Test First-Time User
```javascript
localStorage.clear(); location.reload();
```

### Test 7-Day Re-engagement
```javascript
const pastDate = new Date(); pastDate.setDate(pastDate.getDate() - 8);
localStorage.setItem(`tour_last_dismissal_${userId}`, pastDate.toISOString());
location.reload();
```

### Clear Tour State for Specific User
```javascript
localStorage.removeItem(`tour_last_dismissal_${userId}`);
```

### Check Tour State
```javascript
console.log(localStorage.getItem(`tour_last_dismissal_${userId}`));
```

## Tour CSS Classes Quick Reference

```
Tenant:         dashboard-{properties,bookings,earnings,analytics,messages}-section
Agent:          agent-{commissions,bookings,earnings,profile}-section
Lawyer:         lawyer-{cases,evidence,clients,earnings}-section
Admin:          admin-{users,properties,disputes,payments,reports}-section
Financial:      fin-admin-{payments,settlements,refunds,reports}-section
Transportation: trans-admin-{bookings,routes,drivers,revenue}-section
Fumigation:     fum-admin-{bookings,services,providers,payments}-section
Super Admin:    super-admin-{users,admins,platform,analytics,support}-section
```

## Import Statements

### Use Tour in Component
```javascript
import { useTour } from '../hooks/useTour';

const { showWelcomeModal, startTour, skipTour, replayTour } = useTour();
```

### Get Tour Steps by Role
```javascript
import { getTourStepsByUserRole } from '../config/tourConfig';

const tourSteps = getTourStepsByUserRole(user.user_type);
```

### Use Auth
```javascript
import { useAuth } from '../hooks/useAuth';

const { user, isAuthenticated } = useAuth();
```

## Component Structure

### Basic Dashboard with Tour
```jsx
export default function Dashboard() {
  return (
    <div className="dashboard">
      <section className="dashboard-properties-section">
        <h2>Properties</h2>
      </section>
      
      <section className="dashboard-bookings-section">
        <h2>Bookings</h2>
      </section>
    </div>
  );
}
```

### Add Replay Button
```jsx
import { useTour } from '../hooks/useTour';
import { getTourStepsByUserRole } from '../config/tourConfig';
import { useAuth } from '../hooks/useAuth';

export function Settings() {
  const { replayTour } = useTour();
  const { user } = useAuth();

  const handleReplay = () => {
    const steps = getTourStepsByUserRole(user.user_type);
    replayTour(user.user_type, steps);
  };

  return <button onClick={handleReplay}>Replay Tour</button>;
}
```

## Configuration Reference

### Tour Step Object
```javascript
{
  id: 'unique_id',                    // Unique identifier
  target: '.css-selector',            // Element to highlight
  title: 'Step Title',                // Shown in tooltip
  description: 'User-friendly text',  // Detailed explanation
  placement: 'right',                 // top|right|left|bottom
  highlight: true,                    // Always true
}
```

### Add New Tour
```javascript
// In tourConfig.js:
export const TOUR_STEPS = {
  MY_DASHBOARD: [
    { id: 'my_1', target: '.section-1', title: 'First', description: 'Desc 1', placement: 'right', highlight: true },
    { id: 'my_2', target: '.section-2', title: 'Second', description: 'Desc 2', placement: 'left', highlight: true },
  ],
};

// Map role:
export const getTourStepsByUserRole = (userRole) => {
  const roleToTourMap = {
    my_role: TOUR_STEPS.MY_DASHBOARD,
    // ... others
  };
  return roleToTourMap[userRole] || TOUR_STEPS.TENANT_DASHBOARD;
};
```

## Files Modified/Created

```
✅ CREATED:
   client/src/context/TourContext.jsx
   client/src/hooks/useTour.js
   client/src/components/tour/WelcomeModal.jsx
   client/src/components/tour/TourOverlay.jsx
   client/src/components/tour/TourManager.jsx
   client/src/config/tourConfig.js
   TOUR_INTEGRATION_GUIDE.md
   TOUR_QUICK_START.md
   TOUR_SYSTEM_CHECKLIST.md
   TOUR_SYSTEM_IMPLEMENTATION_SUMMARY.md (this file)
   TOUR_DEVELOPER_REFERENCE.md (this file)

✏️ MODIFIED:
   client/src/pages/App.jsx
     - Added TourProvider import
     - Wrapped app with TourProvider
     - Added TourManager component
```

## Browser DevTools Debugging

### Check if Element Exists
```javascript
document.querySelector('.dashboard-properties-section')
```

### Get Element Info
```javascript
const el = document.querySelector('.dashboard-properties-section');
console.log({
  visible: el.offsetHeight > 0,
  position: el.getBoundingClientRect(),
  display: window.getComputedStyle(el).display,
});
```

### Manually Trigger Tour
```javascript
// In React DevTools console:
// (after installing React DevTools extension)
$r // Current component in React tab
```

## Performance Tips

- Add tour classes to outer containers, not every element
- Avoid nested sections with same class name
- Test on mobile devices
- Use semantic HTML (`<section>`, `<article>`)
- Ensure sections don't have `display: none`

## Common Errors

| Error | Solution |
|-------|----------|
| Tour not showing | Clear localStorage, verify user authenticated |
| Element not highlighting | Check CSS selector, verify element in DOM |
| Tooltip in wrong spot | Adjust `placement` property |
| Tour shows every time | Check localStorage isn't being cleared |
| Multiple tours showing | Verify only one tour per user role |

## Useful Links

- **Context**: `client/src/context/TourContext.jsx`
- **Config**: `client/src/config/tourConfig.js`
- **Guide**: `TOUR_INTEGRATION_GUIDE.md`
- **Quick Start**: `TOUR_QUICK_START.md`
- **Checklist**: `TOUR_SYSTEM_CHECKLIST.md`

## Workflow Checklist

- [ ] Read `TOUR_QUICK_START.md`
- [ ] Open dashboard component
- [ ] Identify sections
- [ ] Add CSS classes to sections
- [ ] Test: Clear localStorage → Login → Verify tour appears
- [ ] Navigate through steps
- [ ] Click Skip → Verify tour closes
- [ ] Login again → Verify tour doesn't show
- [ ] Wait 7 days (or fake it) → Verify tour shows again
- [ ] Mark dashboard as complete in `TOUR_SYSTEM_CHECKLIST.md`

## Testing Shortcuts

```javascript
// Quick test - force 8 day gap
const userId = JSON.parse(localStorage.getItem('user') || '{}').id;
const date = new Date(); date.setDate(date.getDate() - 8);
localStorage.setItem(`tour_last_dismissal_${userId}`, date.toISOString());
```

```javascript
// Quick test - show tour now
localStorage.removeItem(`tour_last_dismissal_${JSON.parse(localStorage.getItem('user') || '{}').id}`);
```

## API Endpoints (Optional Backend)

```
POST   /api/tour/dismiss
GET    /api/tour/status
PUT    /api/tour/reset
DELETE /api/tour/state
```

See `TOUR_INTEGRATION_GUIDE.md` for full spec.

---

**Keep this handy while implementing dashboards!**
Print or bookmark this file for quick reference.

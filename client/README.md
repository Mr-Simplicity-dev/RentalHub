# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

# Transportation/Moving Service Feature

## Overview
This feature allows tenants who have paid their tenancy money to book transportation services (vans, trucks, moving companies) to convey their house items to their new rented property.

## Database Schema
The feature adds 3 new tables:
1. `transportation_services` - Available transportation services
2. `transportation_bookings` - Tenant transportation bookings
3. `transportation_payments` - Links bookings to payments

## API Endpoints

### GET `/api/transportation/services`
Get all available transportation services.

### GET `/api/transportation/services/:serviceId`
Get service details by ID.

### POST `/api/transportation/calculate-price`
Calculate price for transportation based on service and distance.

### GET `/api/transportation/eligibility/:propertyId`
Check if tenant can book transportation for a property (requires rent payment).

### POST `/api/transportation/bookings`
Create a new transportation booking.

### GET `/api/transportation/bookings`
Get tenant's transportation bookings.

### GET `/api/transportation/bookings/:bookingId`
Get booking details by ID.

### DELETE `/api/transportation/bookings/:bookingId/cancel`
Cancel a transportation booking.

### POST `/api/transportation/bookings/:bookingId/pay`
Initialize payment for transportation booking.

### GET `/api/transportation/verify-payment/:reference`
Verify transportation booking payment.

### GET `/api/transportation/stats`
Get transportation statistics for dashboard.

### GET `/api/transportation/upcoming`
Get upcoming transportation bookings.

## Frontend Pages

### 1. Dashboard Integration
- Added "Transport Bookings" stat card to tenant dashboard
- Added transportation modal with stats and quick actions
- Button appears only for tenants who have paid rent

### 2. Transportation Booking Page (`/transportation/book`)
- Service selection with pricing
- Booking form with pickup/destination addresses
- Date/time selection
- Price calculation based on distance

### 3. Transportation Payment Page (`/transportation/payment/:bookingId`)
- Payment options (Paystack integration)
- Booking summary
- Price breakdown
- Payment security information

### 4. Transportation Bookings List (`/transportation/bookings`)
- List all transportation bookings
- Filter by status
- Booking statistics
- Quick actions (pay, cancel, view details)

### 5. Transportation Booking Details (`/transportation/bookings/:bookingId`)
- Detailed booking information
- Status timeline
- Price breakdown
- Driver assignment (if confirmed)
- Print receipt functionality

## Business Logic

### Eligibility Check
Tenants can only book transportation if:
1. They have paid rent for the property (`rent_payment` with `completed` status)
2. They don't have an active booking for the same property
3. Their account is verified

### Payment Flow
1. Tenant creates booking → status: `pending`, payment: `pending`
2. Tenant makes payment → payment: `completed`
3. System confirms booking → status: `confirmed`
4. Driver assigned → driver details added
5. Service completed → status: `completed`

### Pricing Calculation
```
Total Price = Base Price + (Distance × Price per km)
```

## Integration Points

### 1. Dashboard Stats
The tenant dashboard now shows:
- Transport Bookings count
- Transportation modal with quick actions
- Upcoming bookings display

### 2. Payment System Integration
- New payment type: `transportation_booking`
- Integrated with existing Paystack payment flow
- Payment verification and status updates

### 3. Database Updates
- Added `transportation_booking` to `payments.payment_type` CHECK constraint
- Sample transportation services pre-loaded

## Setup Instructions

1. Run the migration:
```bash
# Apply the transportation schema
psql -d your_database -f migrations/013_lawyer_case_notes.sql
```

2. Restart the server:
```bash
npm start
```

3. Test the feature:
- Login as a tenant who has paid rent
- Go to Dashboard
- Click "Transport Bookings" card
- Try creating a booking

## Sample Data
The migration includes 4 sample transportation services:
1. Small Van - ₦5,000 base + ₦200/km
2. Medium Truck - ₦8,000 base + ₦300/km
3. Pickup Truck - ₦4,000 base + ₦150/km
4. Full Moving Service - ₦15,000 base + ₦500/km

## Security Considerations
1. Tenants can only view their own bookings
2. Payment verification required before booking confirmation
3. Cancellation policies enforced
4. Driver contact details only shown after confirmation

## Future Enhancements
1. Real-time driver tracking
2. Multiple payment methods
3. Rating system for drivers
4. Insurance options
5. Packing services add-ons
6. Schedule flexibility options

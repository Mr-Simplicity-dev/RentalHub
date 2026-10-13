# Client Development (Vite)

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

# Client Development

The client uses Vite, React, Tailwind CSS 4, and Vitest. Use Node.js 20.19+ or 22.12+.

```sh
npm install
npm start
npm test
npm run build
```

The development server runs on port 5173 and proxies `/api` and `/socket.io` to the backend on port 5000. Production output is written to `build/`, which is served by the Express application.
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

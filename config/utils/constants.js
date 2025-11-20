export const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'studio', label: 'Studio' },
  { value: 'bungalow', label: 'Bungalow' },
  { value: 'flat', label: 'Flat' },
  { value: 'room', label: 'Room' },
];

export const PAYMENT_FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const AMENITIES = [
  'Parking',
  'Security',
  'Generator',
  'Water Supply',
  'Furnished',
  'Air Conditioning',
  'Internet/WiFi',
  'Swimming Pool',
  'Gym',
  'Garden',
  'Balcony',
  'Elevator',
  'CCTV',
  'Playground',
  'Laundry',
];

export const APPLICATION_STATUS = {
  pending: { label: 'Pending', color: 'yellow' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  withdrawn: { label: 'Withdrawn', color: 'gray' },
};

export const PAYMENT_METHODS = [
  { value: 'paystack', label: 'Paystack (Card Payment)' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
  'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'Federal Capital Territory', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
];
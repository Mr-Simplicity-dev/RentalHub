const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'studio', label: 'Studio' },
  { value: 'bungalow', label: 'Bungalow' },
  { value: 'flat', label: 'Flat' },
  { value: 'room', label: 'Room' },
];

const PAYMENT_FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const AMENITIES = [
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

const APPLICATION_STATUS = {
  pending: { label: 'Pending', color: 'yellow' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  withdrawn: { label: 'Withdrawn', color: 'gray' },
};

const PAYMENT_METHODS = [
  { value: 'paystack', label: 'Paystack (Card Payment)' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
  'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'Federal Capital Territory', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
];

module.exports = {
  PROPERTY_TYPES,
  PAYMENT_FREQUENCIES,
  AMENITIES,
  APPLICATION_STATUS,
  PAYMENT_METHODS,
  NIGERIAN_STATES,
};

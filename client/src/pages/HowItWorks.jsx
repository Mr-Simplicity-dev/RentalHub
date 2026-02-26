const tenantSteps = [
  'Create an account and complete verification.',
  'Browse properties using filters for location, budget, and type.',
  'Subscribe to unlock full property details and landlord contact.',
  'Save properties, send messages, and submit applications.',
];

const landlordSteps = [
  'Register as a landlord and verify your profile.',
  'Add a property with complete details and media.',
  'Pay for a listing plan to activate visibility.',
  'Review applications and manage inquiries from your dashboard.',
];

const HowitWorks = () => (
  <div className="container mx-auto px-4 py-12 max-w-5xl">
    <h1 className="text-3xl font-bold">How It Works</h1>
    <p className="mt-3 text-gray-600">
      A simple flow for tenants and landlords to transact safely.
    </p>

    <div className="grid md:grid-cols-2 gap-6 mt-8">
      <section className="card">
        <h2 className="text-xl font-semibold">For Tenants</h2>
        <ol className="mt-4 space-y-2 list-decimal list-inside text-gray-700">
          {tenantSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold">For Landlords</h2>
        <ol className="mt-4 space-y-2 list-decimal list-inside text-gray-700">
          {landlordSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </div>
  </div>
);

export default HowitWorks;

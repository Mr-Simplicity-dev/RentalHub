const checklist = [
  'Use clear titles and accurate descriptions.',
  'Upload bright, high-quality photos from multiple angles.',
  'Provide realistic rent and complete location details.',
  'Respond quickly to tenant messages and applications.',
  'Keep listing status updated to avoid stale applications.',
];

const LandlordGuide = () => (
  <div className="container mx-auto px-4 py-12 max-w-4xl">
    <h1 className="text-3xl font-bold">Landlord Guide</h1>
    <p className="mt-3 text-gray-600">
      Practical tips to publish trusted listings and get quality tenants faster.
    </p>

    <section className="card mt-8">
      <h2 className="text-xl font-semibold">Best Practices</h2>
      <ul className="mt-4 space-y-2 list-disc list-inside text-gray-700">
        {checklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>

    <section className="card mt-6">
      <h2 className="text-xl font-semibold">Verification and Compliance</h2>
      <p className="mt-2 text-gray-700">
        Verified listings build trust and improve conversion. Make sure your identity
        information and listing documents are accurate before submission.
      </p>
    </section>

    <section className="card mt-6">
      <h2 className="text-xl font-semibold">Support</h2>
      <p className="mt-2 text-gray-700">
        If your listing is rejected, review the feedback, update details, and resubmit.
        Contact support for account or payment issues.
      </p>
    </section>
  </div>
);

export default LandlordGuide;

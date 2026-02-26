const faqs = [
  {
    question: 'Do I need to verify my identity before using the platform?',
    answer:
      'Yes. Identity verification helps reduce fraud and protects both tenants and landlords.',
  },
  {
    question: 'Can I contact landlords without an active tenant subscription?',
    answer:
      'You can browse listings, but direct landlord contact and full property details require an active tenant subscription.',
  },
  {
    question: 'How does property verification work?',
    answer:
      'Admin staff review new listings and submitted identity documents before approving properties for public visibility.',
  },
  {
    question: 'What happens when a listing expires?',
    answer:
      'The listing is automatically marked unavailable until the landlord renews the listing plan.',
  },
  {
    question: 'Can I save properties and apply later?',
    answer:
      'Yes. Use the save feature to bookmark properties and submit applications when ready.',
  },
];

const Faq = () => (
  <div className="container mx-auto px-4 py-12 max-w-4xl">
    <h1 className="text-3xl font-bold">Frequently Asked Questions</h1>
    <p className="mt-3 text-gray-600">
      Common questions from tenants and landlords.
    </p>

    <div className="mt-8 space-y-4">
      {faqs.map((item) => (
        <div key={item.question} className="card">
          <h2 className="text-lg font-semibold text-gray-900">{item.question}</h2>
          <p className="mt-2 text-gray-600">{item.answer}</p>
        </div>
      ))}
    </div>
  </div>
);

export default Faq;

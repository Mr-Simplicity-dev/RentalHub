const whatsappFaqData = [
  {
    id: 'find-property',
    keywords: ['find', 'property', 'search', 'apartment', 'house', 'home', 'rent', 'looking', 'available', 'listing'],
    answer: 'You can search for properties by State and LGA right on our homepage. Each listing shows photos, price, features, and the landlord\'s verification status. You can also request a physical or virtual tour directly from the property page.',
    link: '/',
    linkText: 'Search properties',
  },
  {
    id: 'list-property',
    keywords: ['list', 'listing', 'landlord', 'post', 'advertise', 'add property', 'rent out', 'lease'],
    answer: 'To list your property, create an account and select "List a Property" from your dashboard. All listings go through a quick verification process to ensure quality and trust. Once verified, your property will be visible to thousands of potential tenants.',
    link: '/register',
    linkText: 'Create an account',
  },
  {
    id: 'payment',
    keywords: ['payment', 'pay', 'fee', 'escrow', 'money', 'cost', 'price', 'charge', 'transaction', 'secure', 'safe'],
    answer: 'The available payment options and fees are shown before confirmation. Sign in and check Payment History for the exact status and reference. Avoid repeating a payment while its status is uncertain.',
    link: null,
    linkText: null,
  },
  {
    id: 'legal',
    keywords: ['legal', 'lawyer', 'attorney', 'protection', 'coverage', 'law', 'document', 'agreement', 'dispute', 'nba', 'access fee', '2000'],
    answer: 'Paid coverage is required for private assistance requests. Check your coverage status from your dashboard; registration shows any applicable coverage fee before payment.',
    link: null,
    linkText: null,
  },
  {
    id: 'fumigation',
    keywords: ['fumigation', 'fumigate', 'pest', 'spray', 'insect', 'treatment', 'booking', 'clean'],
    answer: 'You can book fumigation services directly from your dashboard. Select "Book Fumigation", pick your preferred date and time, and a verified service provider will be dispatched to your property.',
    link: null,
    linkText: null,
  },
  {
    id: 'transport',
    keywords: ['transport', 'moving', 'move', 'truck', 'delivery', 'logistics', 'shipping', 'van', 'haul'],
    answer: 'Need to move items? You can book transport services through your dashboard. Select "Book Transport" to arrange moving for your belongings to or from your property at competitive rates.',
    link: null,
    linkText: null,
  },
  {
    id: 'account',
    keywords: ['account', 'password', 'login', 'sign in', 'reset', 'forgot', 'access', 'profile', 'update', 'change'],
    answer: 'If you\'re having trouble with your account, use the "Forgot Password" link on the login page to reset your password. You can update your profile information from your account settings after logging in.',
    link: null,
    linkText: null,
  },
  {
    id: 'support',
    keywords: ['support', 'help', 'contact', 'agent', 'human', 'person', 'talk', 'speak', 'customer service', 'representative', 'issue', 'problem', 'complaint'],
    answer: 'Tell me which screen you are using and what went wrong. I can help narrow the problem and check records after you sign in. If it remains unresolved, we can prepare a support ticket or request a person.',
    link: null,
    linkText: null,
  },
  {
    id: 'registration',
    keywords: ['register', 'sign up', 'create account', 'join', 'tenant', 'landlord', 'signup', 'how to join'],
    answer: 'Choose a tenant or landlord account and complete the registration form. The current registration and optional coverage fees are shown before payment.',
    link: '/register',
    linkText: 'Sign up now',
  },
  {
    id: 'verification',
    keywords: ['verify', 'verification', 'verified', 'badge', 'trust', 'authentic', 'genuine', 'identity', 'document'],
    answer: 'Property listings and user accounts go through a verification process to ensure authenticity. Verified properties and users are marked with a blue check badge, so you know you\'re dealing with a trusted party.',
    link: null,
    linkText: null,
  },
];

const findBestMatch = (userInput) => {
  const words = userInput.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const faq of whatsappFaqData) {
    let score = 0;
    const inputStr = userInput.toLowerCase();
    for (const keyword of faq.keywords) {
      if (keyword.includes(' ')) {
        if (inputStr.includes(keyword)) score += 3;
      } else {
        if (words.includes(keyword)) score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = faq;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
};

export { whatsappFaqData, findBestMatch };

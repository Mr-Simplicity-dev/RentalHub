const db = require('../middleware/database');
const { getLocationPricingQuote } = require('./locationPricing');

const numberFromEnv = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
};

const LANDLORD_ANNUAL_LISTING_RENEWAL_FEE_PER_PROPERTY_NGN = numberFromEnv(
  'LANDLORD_ANNUAL_LISTING_RENEWAL_FEE_PER_PROPERTY_NGN',
  numberFromEnv('LANDLORD_PROPERTY_FEE_PER_PROPERTY_NGN', 500)
);
const LANDLORD_MONTHLY_MAINTENANCE_FEE_PER_PROPERTY_NGN = numberFromEnv(
  'LANDLORD_MONTHLY_MAINTENANCE_FEE_PER_PROPERTY_NGN',
  100
);
const LANDLORD_PROPERTY_FEE_PER_PROPERTY_NGN = LANDLORD_ANNUAL_LISTING_RENEWAL_FEE_PER_PROPERTY_NGN;
const LANDLORD_PROPERTY_FEE_REMINDER_DAYS = Math.max(
  numberFromEnv('LANDLORD_PROPERTY_FEE_REMINDER_DAYS', 7),
  1
);
const LANDLORD_PROPERTY_FEE_RESERVE_DAYS = Math.max(
  numberFromEnv('LANDLORD_PROPERTY_FEE_RESERVE_DAYS', 30),
  LANDLORD_PROPERTY_FEE_REMINDER_DAYS
);
const LANDLORD_PROPERTY_FEE_SKIPPABLE_DAYS = Math.max(
  numberFromEnv('LANDLORD_PROPERTY_FEE_SKIPPABLE_DAYS', 2),
  0
);

let landlordPropertyFeeSchemaReady = false;

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_EVENT_TABLES = new Set([
  'landlord_property_fee_events',
  'landlord_property_maintenance_fee_events',
]);

const toDateOnly = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return new Date(value).toISOString().slice(0, 10);
};

const dateFromKey = (key) => new Date(`${toDateOnly(key)}T00:00:00.000Z`);

const addDays = (value, days) => {
  const next = dateFromKey(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addYears = (value, years) => {
  const next = dateFromKey(value);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
};

const addMonths = (value, months) => {
  const next = dateFromKey(value);
  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return next;
};

const FEE_CONFIGS = [
  {
    type: 'annual_listing_renewal',
    table: 'landlord_property_fee_events',
    label: 'Annual Listing Renewal Fee',
    reserveLabel: 'annual listing renewal fee',
    cadence: 'yearly',
    description: 'Keeps your posted landlord properties renewed each year on RentalHub.',
    feePerProperty: LANDLORD_ANNUAL_LISTING_RENEWAL_FEE_PER_PROPERTY_NGN,
    pricingTarget: 'landlord_annual_listing_renewal_fee',
    deductionType: 'annual_listing_renewal',
    referencePrefix: 'ALR',
    addInterval: addYears,
  },
  {
    type: 'monthly_maintenance',
    table: 'landlord_property_maintenance_fee_events',
    label: 'Monthly Maintenance Fee',
    reserveLabel: 'monthly maintenance fee',
    cadence: 'monthly',
    description: 'Keeps your posted landlord properties maintained each month on RentalHub.',
    feePerProperty: LANDLORD_MONTHLY_MAINTENANCE_FEE_PER_PROPERTY_NGN,
    pricingTarget: 'landlord_monthly_maintenance_fee',
    deductionType: 'monthly_maintenance',
    referencePrefix: 'MMF',
    addInterval: addMonths,
  },
];

const getFeeConfig = (feeType) => FEE_CONFIGS.find((config) => config.type === feeType);

const normalizeSkipDates = (value) => {
  if (Array.isArray(value)) {
    return value.map(toDateOnly).filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeSkipDates(parsed);
    } catch {
      return [];
    }
  }

  return [];
};

const sumAmounts = (fees) => fees.reduce((total, fee) => total + Number(fee.amount_due || 0), 0);

const sortFeesByDueDate = (fees) =>
  [...fees].sort((a, b) => {
    const aDue = a.due_at ? dateFromKey(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.due_at ? dateFromKey(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return String(a.fee_type).localeCompare(String(b.fee_type));
  });

const advanceDueToCurrentCycle = (dueAt, now, addInterval) => {
  let dueDate = dateFromKey(dueAt);
  const today = dateFromKey(now || new Date());
  let guard = 0;

  while (guard < 600) {
    const nextDueDate = addInterval(dueDate, 1);
    if (nextDueDate > today) break;
    dueDate = nextDueDate;
    guard += 1;
  }

  return dueDate;
};

const assertAllowedEventTable = (table) => {
  if (!ALLOWED_EVENT_TABLES.has(table)) {
    throw new Error(`Unsupported landlord property fee table: ${table}`);
  }
};

const ensureLandlordPropertyFeeSchema = async (executor = db) => {
  if (landlordPropertyFeeSchemaReady) return;

  await executor.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS landlord_rent_deductions (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL,
      deduction_type VARCHAR(40) NOT NULL DEFAULT 'subscription',
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE landlord_rent_deductions
      DROP CONSTRAINT IF EXISTS chk_landlord_rent_deduction_type;

    ALTER TABLE landlord_rent_deductions
      ADD CONSTRAINT chk_landlord_rent_deduction_type
      CHECK (
        deduction_type IN (
          'subscription',
          'property_fee',
          'annual_listing_renewal',
          'monthly_maintenance'
        )
      );

    CREATE INDEX IF NOT EXISTS idx_landlord_rent_deductions_landlord
      ON landlord_rent_deductions(landlord_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS landlord_property_fee_events (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      due_at DATE NOT NULL,
      property_count INTEGER NOT NULL DEFAULT 0,
      amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      skip_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
      agreed_at TIMESTAMP,
      paid_at TIMESTAMP,
      wallet_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
      rent_balance_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
      transaction_reference VARCHAR(120),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT landlord_property_fee_status_check
        CHECK (status IN ('pending', 'insufficient', 'paid')),
      CONSTRAINT landlord_property_fee_unique_due UNIQUE (landlord_id, due_at)
    );

    CREATE INDEX IF NOT EXISTS idx_landlord_property_fee_events_lookup
      ON landlord_property_fee_events(landlord_id, due_at DESC, status);

    CREATE TABLE IF NOT EXISTS landlord_property_maintenance_fee_events (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      due_at DATE NOT NULL,
      property_count INTEGER NOT NULL DEFAULT 0,
      amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      skip_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
      agreed_at TIMESTAMP,
      paid_at TIMESTAMP,
      wallet_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
      rent_balance_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
      transaction_reference VARCHAR(120),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT landlord_property_maintenance_fee_status_check
        CHECK (status IN ('pending', 'insufficient', 'paid')),
      CONSTRAINT landlord_property_maintenance_fee_unique_due UNIQUE (landlord_id, due_at)
    );

    CREATE INDEX IF NOT EXISTS idx_landlord_property_maintenance_fee_events_lookup
      ON landlord_property_maintenance_fee_events(landlord_id, due_at DESC, status);
  `);

  landlordPropertyFeeSchemaReady = true;
};

const getLandlordPropertyStats = async (landlordId, executor = db) => {
  const result = await executor.query(
    `SELECT
       MIN(created_at) AS first_property_at,
       COUNT(*) AS property_count
     FROM properties
     WHERE landlord_id = $1`,
    [landlordId]
  );

  const row = result.rows[0] || {};
  return {
    first_property_at: row.first_property_at || null,
    property_count: Number(row.property_count || 0),
  };
};

const resolveLandlordPricingLocation = async (landlordId, executor = db) => {
  const userResult = await executor.query(
    `SELECT preferred_state_id, preferred_lga_name
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [landlordId]
  );
  const user = userResult.rows[0] || {};

  if (user.preferred_state_id) {
    return {
      state_id: user.preferred_state_id,
      lga_name: user.preferred_lga_name || null,
      source: 'profile',
    };
  }

  const propertyLocationResult = await executor.query(
    `SELECT state_id, lga_name
     FROM properties
     WHERE landlord_id = $1
       AND state_id IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [landlordId]
  );
  const propertyLocation = propertyLocationResult.rows[0] || {};

  if (propertyLocation.state_id) {
    return {
      state_id: propertyLocation.state_id,
      lga_name: propertyLocation.lga_name || null,
      source: 'latest_property',
    };
  }

  return {
    state_id: null,
    lga_name: null,
    source: 'base',
  };
};

const resolveFeePricing = async (landlordId, config, executor = db) => {
  const location = await resolveLandlordPricingLocation(landlordId, executor);
  const quote = await getLocationPricingQuote({
    appliesTo: config.pricingTarget,
    stateId: location.state_id,
    lgaName: location.lga_name,
  });
  const amount = Math.max(config.feePerProperty, Number(quote.amount || config.feePerProperty));

  return {
    ...quote,
    amount,
    base_amount: config.feePerProperty,
    pricing_target: config.pricingTarget,
    location,
  };
};

const getLandlordFeeFundingSnapshot = async (landlordId, executor = db) => {
  await ensureLandlordPropertyFeeSchema(executor);

  const walletResult = await executor.query(
    `SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1`,
    [landlordId]
  );
  const walletBalance = walletResult.rows.length
    ? Number(walletResult.rows[0].balance || 0)
    : 0;

  const clearedResult = await executor.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS cleared_amount
     FROM payments p
     JOIN properties prop ON p.property_id = prop.id
     WHERE prop.landlord_id = $1
       AND p.payment_type = 'rent_payment'
       AND p.payment_status = 'completed'
       AND p.completed_at < NOW() - INTERVAL '20 days'
       AND NOT EXISTS (
         SELECT 1 FROM refund_requests rr
         WHERE rr.payment_id = p.id
           AND rr.status IN ('pending','approved')
       )`,
    [landlordId]
  );

  const withdrawnResult = await executor.query(
    `SELECT COALESCE(SUM(amount), 0) AS withdrawn_amount
     FROM withdrawal_requests
     WHERE user_id = $1
       AND status IN ('approved','processed')`,
    [landlordId]
  );

  const deductionResult = await executor.query(
    `SELECT COALESCE(SUM(amount), 0) AS deducted_amount
     FROM landlord_rent_deductions
     WHERE landlord_id = $1`,
    [landlordId]
  );

  const rentBalance = Math.max(
    0,
    Number(clearedResult.rows[0]?.cleared_amount || 0) -
      Number(withdrawnResult.rows[0]?.withdrawn_amount || 0) -
      Number(deductionResult.rows[0]?.deducted_amount || 0)
  );

  return {
    wallet_balance: walletBalance,
    rent_available_to_deduct: rentBalance,
    total_available: walletBalance + rentBalance,
  };
};

const resolveFeeCycle = async (landlordId, config, executor = db, now = new Date()) => {
  await ensureLandlordPropertyFeeSchema(executor);
  assertAllowedEventTable(config.table);

  const stats = await getLandlordPropertyStats(landlordId, executor);
  if (!stats.property_count || !stats.first_property_at) {
    return {
      config,
      has_properties: false,
      stats,
      event: null,
      due_at: null,
      amount_due: 0,
    };
  }

  const lastPaidResult = await executor.query(
    `SELECT due_at
     FROM ${config.table}
     WHERE landlord_id = $1
       AND status = 'paid'
     ORDER BY due_at DESC
     LIMIT 1`,
    [landlordId]
  );

  const firstDue = config.addInterval(stats.first_property_at, 1);
  const nextDue = lastPaidResult.rows[0]?.due_at
    ? config.addInterval(lastPaidResult.rows[0].due_at, 1)
    : firstDue;
  const dueAt = advanceDueToCurrentCycle(nextDue, now, config.addInterval);
  const dueKey = toDateOnly(dueAt);
  const pricing = await resolveFeePricing(landlordId, config, executor);
  const feePerProperty = Number(pricing.amount || config.feePerProperty);
  const amountDue = stats.property_count * feePerProperty;

  const existingResult = await executor.query(
    `SELECT *
     FROM ${config.table}
     WHERE landlord_id = $1
       AND due_at = $2::date
     LIMIT 1`,
    [landlordId, dueKey]
  );

  let event = existingResult.rows[0] || null;

  if (!event) {
    const inserted = await executor.query(
      `INSERT INTO ${config.table} (
         landlord_id, due_at, property_count, amount_due
       )
       VALUES ($1, $2::date, $3, $4)
       RETURNING *`,
      [landlordId, dueKey, stats.property_count, amountDue]
    );
    event = inserted.rows[0];
  } else if (event.status !== 'paid') {
    const updated = await executor.query(
      `UPDATE ${config.table}
       SET property_count = $3,
           amount_due = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE landlord_id = $1
         AND due_at = $2::date
       RETURNING *`,
      [landlordId, dueKey, stats.property_count, amountDue]
    );
    event = updated.rows[0];
  }

  return {
    config,
    has_properties: true,
    stats,
    event,
    due_at: dueKey,
    amount_due: amountDue,
    pricing,
    fee_per_property: feePerProperty,
  };
};

const buildFeeStatus = (cycle, funding, now = new Date()) => {
  const { config } = cycle;

  if (!cycle.has_properties) {
    return {
      fee_type: config.type,
      fee_label: config.label,
      label: config.label,
      reserve_label: config.reserveLabel,
      description: config.description,
      cadence: config.cadence,
      event_table: config.table,
      pricing_target: config.pricingTarget,
      pricing: null,
      pricing_rule_scope: 'base',
      pricing_location: null,
      has_properties: false,
      property_count: 0,
      fee_per_property: config.feePerProperty,
      amount_due: 0,
      due_at: null,
      modal_required: false,
      modal_action: null,
      blocking: false,
      reserve_required: false,
      funding,
      can_settle: true,
      deduction_type: config.deductionType,
    };
  }

  const event = cycle.event;
  const dueDate = dateFromKey(cycle.due_at);
  const todayKey = toDateOnly(now);
  const todayDate = dateFromKey(todayKey);
  const reminderStart = addDays(dueDate, -LANDLORD_PROPERTY_FEE_REMINDER_DAYS);
  const reserveStart = addDays(dueDate, -LANDLORD_PROPERTY_FEE_RESERVE_DAYS);
  const skipDates = normalizeSkipDates(event.skip_dates);
  const skippedToday = skipDates.includes(todayKey);
  const reminderDayIndex = Math.floor((todayDate.getTime() - reminderStart.getTime()) / DAY_MS);
  const inReminderWindow = todayDate >= reminderStart && event.status !== 'paid';
  const inReserveWindow = todayDate >= reserveStart && event.status !== 'paid';
  const skippable = inReminderWindow && reminderDayIndex < LANDLORD_PROPERTY_FEE_SKIPPABLE_DAYS;
  const modalAction = inReminderWindow ? (skippable ? 'skip' : 'agree') : null;
  const modalRequired = inReminderWindow && !(skippable && skippedToday);
  const amountDue = Number(event.amount_due || cycle.amount_due || 0);

  return {
    fee_type: config.type,
    fee_label: config.label,
    label: config.label,
    reserve_label: config.reserveLabel,
    description: config.description,
    cadence: config.cadence,
    event_table: config.table,
    pricing_target: config.pricingTarget,
    pricing: cycle.pricing || null,
    pricing_rule_scope: cycle.pricing?.rule_scope || 'base',
    pricing_location: cycle.pricing?.location || null,
    event_id: event.id,
    has_properties: true,
    property_count: Number(event.property_count || cycle.stats.property_count || 0),
    fee_per_property: Number(cycle.fee_per_property || config.feePerProperty),
    amount_due: amountDue,
    due_at: toDateOnly(event.due_at || cycle.due_at),
    reminder_starts_at: toDateOnly(reminderStart),
    reserve_starts_at: toDateOnly(reserveStart),
    days_until_due: Math.ceil((dueDate.getTime() - todayDate.getTime()) / DAY_MS),
    reminder_day: inReminderWindow ? Math.max(1, reminderDayIndex + 1) : 0,
    skippable,
    skipped_today: skippedToday,
    skip_dates: skipDates,
    modal_required: modalRequired,
    modal_action: modalAction,
    blocking: modalAction === 'agree',
    reserve_required: inReserveWindow,
    status: event.status,
    paid_at: event.paid_at || null,
    agreed_at: event.agreed_at || null,
    funding,
    available_after_reserve: inReserveWindow
      ? Math.max(0, Number(funding.total_available || 0) - amountDue)
      : Number(funding.total_available || 0),
    can_settle: Number(funding.total_available || 0) >= amountDue,
    deduction_type: config.deductionType,
  };
};

const getLandlordPropertyFeeStatus = async (
  landlordId,
  { now = new Date(), executor = db } = {}
) => {
  await ensureLandlordPropertyFeeSchema(executor);

  const funding = await getLandlordFeeFundingSnapshot(landlordId, executor);
  const fees = [];

  for (const config of FEE_CONFIGS) {
    const cycle = await resolveFeeCycle(landlordId, config, executor, now);
    fees.push(buildFeeStatus(cycle, funding, now));
  }

  const sortedFees = sortFeesByDueDate(fees);
  const modalFees = sortFeesByDueDate(sortedFees.filter((fee) => fee.modal_required));
  const reserveFees = sortFeesByDueDate(sortedFees.filter((fee) => fee.reserve_required));
  const modalAction = modalFees.some((fee) => fee.modal_action === 'agree')
    ? 'agree'
    : modalFees.length
      ? 'skip'
      : null;
  const activeModalFees = modalAction === 'agree'
    ? modalFees
    : modalFees.filter((fee) => fee.modal_action === 'skip');
  const primaryFee = activeModalFees[0] || reserveFees[0] || sortedFees.find((fee) => fee.has_properties) || sortedFees[0];
  const reserveAmountDue = sumAmounts(reserveFees);
  const modalAmountDue = sumAmounts(activeModalFees);
  const amountDue = reserveFees.length ? reserveAmountDue : modalAmountDue;
  const hasProperties = sortedFees.some((fee) => fee.has_properties);

  return {
    has_properties: hasProperties,
    property_count: Number(primaryFee?.property_count || 0),
    fee_type: primaryFee?.fee_type || null,
    fee_label: reserveFees.length > 1 || activeModalFees.length > 1
      ? 'Landlord Property Charges'
      : primaryFee?.fee_label || 'Landlord Property Charges',
    reserve_label: reserveFees.length > 1
      ? 'landlord property charges'
      : primaryFee?.reserve_label || 'landlord property charges',
    fee_per_property: activeModalFees.length === 1
      ? Number(activeModalFees[0].fee_per_property || 0)
      : Number(primaryFee?.fee_per_property || 0),
    amount_due: amountDue,
    due_at: primaryFee?.due_at || null,
    reminder_starts_at: primaryFee?.reminder_starts_at || null,
    reserve_starts_at: primaryFee?.reserve_starts_at || null,
    days_until_due: primaryFee?.days_until_due ?? null,
    reminder_day: primaryFee?.reminder_day || 0,
    skippable: modalAction === 'skip',
    skipped_today: modalFees.length > 0 && modalFees.every((fee) => fee.skipped_today),
    skip_dates: primaryFee?.skip_dates || [],
    modal_required: activeModalFees.length > 0,
    modal_action: modalAction,
    blocking: modalAction === 'agree',
    reserve_required: reserveFees.length > 0,
    status: activeModalFees.some((fee) => fee.status === 'insufficient')
      ? 'insufficient'
      : activeModalFees.length
        ? 'pending'
        : primaryFee?.status || 'pending',
    funding,
    available_after_reserve: reserveFees.length
      ? Math.max(0, Number(funding.total_available || 0) - reserveAmountDue)
      : Number(funding.total_available || 0),
    can_settle: Number(funding.total_available || 0) >= modalAmountDue,
    total_reserved_amount: reserveAmountDue,
    modal_amount_due: modalAmountDue,
    fees: sortedFees,
    modal_fees: activeModalFees,
    reserve_fees: reserveFees,
    annual_listing_renewal_fee: sortedFees.find((fee) => fee.fee_type === 'annual_listing_renewal') || null,
    monthly_maintenance_fee: sortedFees.find((fee) => fee.fee_type === 'monthly_maintenance') || null,
  };
};

const skipLandlordPropertyFeeNotice = async (landlordId) => {
  const status = await getLandlordPropertyFeeStatus(landlordId);

  if (!status.modal_required || status.modal_action !== 'skip' || !status.modal_fees.length) {
    const error = new Error('This notice can no longer be skipped');
    error.statusCode = 400;
    throw error;
  }

  const todayKey = toDateOnly(new Date());

  for (const fee of status.modal_fees) {
    assertAllowedEventTable(fee.event_table);
    const nextSkipDates = [...new Set([...fee.skip_dates, todayKey])];
    await db.query(
      `UPDATE ${fee.event_table}
       SET skip_dates = $2::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fee.event_id, JSON.stringify(nextSkipDates)]
    );
  }

  return getLandlordPropertyFeeStatus(landlordId);
};

const settleLandlordPropertyFee = async (landlordId) => {
  const client = await db.connect();

  try {
    await ensureLandlordPropertyFeeSchema(client);
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [landlordId]
    );

    await client.query(
      `SELECT id, balance
       FROM wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [landlordId]
    );

    const status = await getLandlordPropertyFeeStatus(landlordId, { executor: client });
    const feesToSettle = status.modal_required
      ? sortFeesByDueDate(status.modal_fees)
      : [];

    if (!feesToSettle.length) {
      await client.query('COMMIT');
      return {
        success: true,
        paid: false,
        message: 'No landlord property charge is due yet',
      };
    }

    for (const fee of feesToSettle) {
      assertAllowedEventTable(fee.event_table);
      await client.query(
        `SELECT id
         FROM ${fee.event_table}
         WHERE id = $1
         FOR UPDATE`,
        [fee.event_id]
      );
    }

    const funding = await getLandlordFeeFundingSnapshot(landlordId, client);
    const totalAmountDue = sumAmounts(feesToSettle);

    if (Number(funding.total_available || 0) < totalAmountDue) {
      for (const fee of feesToSettle) {
        await client.query(
          `UPDATE ${fee.event_table}
           SET status = 'insufficient',
               agreed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [fee.event_id]
        );
      }

      await client.query('COMMIT');

      const error = new Error(
        `Insufficient balance for landlord property charges. Required: N${totalAmountDue.toLocaleString()}, available: N${Number(funding.total_available || 0).toLocaleString()}.`
      );
      error.statusCode = 402;
      error.data = {
        funding,
        amount_due: totalAmountDue,
        fees: feesToSettle,
      };
      throw error;
    }

    const walletDebit = Math.min(Number(funding.wallet_balance || 0), totalAmountDue);
    const rentDebit = Math.round((totalAmountDue - walletDebit) * 100) / 100;
    const reference = `LPB_${Date.now()}`;

    if (walletDebit > 0) {
      await client.query(
        `UPDATE wallets
         SET balance = balance - $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [landlordId, walletDebit]
      );
    }

    let remainingWalletDebit = walletDebit;
    const settledFees = [];

    for (const fee of feesToSettle) {
      const config = getFeeConfig(fee.fee_type);
      const feeAmount = Number(fee.amount_due || 0);
      const feeWalletDebit = Math.min(remainingWalletDebit, feeAmount);
      remainingWalletDebit = Math.round((remainingWalletDebit - feeWalletDebit) * 100) / 100;
      const feeRentDebit = Math.round((feeAmount - feeWalletDebit) * 100) / 100;
      const feeReference = `${config.referencePrefix}_${fee.event_id}_${reference}`;

      if (feeRentDebit > 0) {
        await client.query(
          `INSERT INTO landlord_rent_deductions (
             landlord_id, amount, deduction_type, description
           )
           VALUES ($1, $2, $3, $4)`,
          [
            landlordId,
            feeRentDebit,
            config.deductionType,
            `${config.label} ${feeReference}`,
          ]
        );
      }

      const updated = await client.query(
        `UPDATE ${config.table}
         SET status = 'paid',
             agreed_at = COALESCE(agreed_at, CURRENT_TIMESTAMP),
             paid_at = CURRENT_TIMESTAMP,
             wallet_deducted = $2,
             rent_balance_deducted = $3,
             transaction_reference = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [fee.event_id, feeWalletDebit, feeRentDebit, feeReference]
      );

      settledFees.push({
        fee_type: fee.fee_type,
        fee_label: config.label,
        event: updated.rows[0],
        wallet_deducted: feeWalletDebit,
        rent_balance_deducted: feeRentDebit,
        reference: feeReference,
      });
    }

    await client.query('COMMIT');

    return {
      success: true,
      paid: true,
      amount_due: totalAmountDue,
      funding,
      wallet_deducted: walletDebit,
      rent_balance_deducted: rentDebit,
      reference,
      fees: settledFees,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors when the transaction has already completed.
    }
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  LANDLORD_PROPERTY_FEE_PER_PROPERTY_NGN,
  LANDLORD_ANNUAL_LISTING_RENEWAL_FEE_PER_PROPERTY_NGN,
  LANDLORD_MONTHLY_MAINTENANCE_FEE_PER_PROPERTY_NGN,
  LANDLORD_PROPERTY_FEE_REMINDER_DAYS,
  LANDLORD_PROPERTY_FEE_RESERVE_DAYS,
  ensureLandlordPropertyFeeSchema,
  getLandlordFeeFundingSnapshot,
  getLandlordPropertyFeeStatus,
  settleLandlordPropertyFee,
  skipLandlordPropertyFeeNotice,
};

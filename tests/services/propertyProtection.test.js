const test = require("node:test"),
  assert = require("node:assert/strict");
const p = require("../../services/propertyProtectionPolicy");
const {
  confirmed,
  createPaymentService,
} = require("../../services/propertyProtectionPayments");
const valid = () => ({
  title: "Family land",
  property_type: "land",
  state_id: 1,
  lga_name: "Ikeja",
  address: "Plot on the estate road",
  acquisition_method: "inheritance",
  ownership_capacity: "individual",
});
test("unlisted land can be registered without requiring a Certificate of Occupancy", () => {
  assert.equal(p.propertyInput(valid()).property_type, "land");
});
for (const capacity of ["family", "joint", "company"])
  test(capacity + " registration requires recorded authority", () => {
    assert.throws(
      () => p.propertyInput({ ...valid(), ownership_capacity: capacity }),
      /authority/,
    );
    assert.equal(
      p.propertyInput({
        ...valid(),
        ownership_capacity: capacity,
        ownership_details: {
          name: "Registered group",
          authority: "Authority recorded by the members",
        },
      }).ownership_capacity,
      capacity,
    );
  });
test("coordinates must be a valid pair", () => {
  assert.throws(
    () => p.propertyInput({ ...valid(), latitude: 6 }),
    /both coordinates/,
  );
  assert.throws(
    () => p.propertyInput({ ...valid(), latitude: 99, longitude: 3 }),
    /coordinates/,
  );
  assert.equal(
    p.propertyInput({ ...valid(), latitude: 6, longitude: 3 }).longitude,
    3,
  );
});
test("registry result needs the actual source, office, reference and date", () => {
  assert.throws(() => p.sourceInput({}, "registry"), /registry/);
  const source = {
    source: "Registry record",
    office: "Registry office",
    state: "Lagos",
    reference: "Search-1",
    search_date: "2026-01-01",
    result: "Recorded result",
    limitations: "Scope of search only",
  };
  assert.equal(p.sourceInput(source, "registry").reference, "Search-1");
  assert.throws(
    () => p.sourceInput({ ...source, search_date: "2999-01-01" }, "registry"),
    /actual registry/,
  );
});
test("surveyor assessment needs an authority or qualification reference", () =>
  assert.throws(() => p.sourceInput({}, "survey"), /qualification/));
test("final verification needs every preceding stage, scope, limits and future expiry", () => {
  const body = {
    scope: "The seven listed checks only",
    limitations: "Not a title guarantee",
    valid_until: "2999-01-01",
  };
  assert.throws(() => p.finalDecision([], body), /Every required/);
  const checks = p.STAGES.slice(0, -1).map((stage) => ({
    stage,
    status: "approved",
  }));
  assert.ok(p.finalDecision(checks, body) instanceof Date);
  assert.throws(
    () => p.finalDecision(checks, { ...body, limitations: "" }),
    /limitations/,
  );
  assert.throws(
    () => p.finalDecision(checks, { ...body, valid_until: "2000-01-01" }),
    /future/,
  );
});
test("client payment claims cannot replace exact backend provider verification", () => {
  const request = {
      currency: "NGN",
      amount: 500,
      payment_email: "owner@example.com",
    },
    stored = { transaction_reference: "ARH_PP_test" },
    receipt = {
      status: "success",
      reference: "ARH_PP_test",
      currency: "NGN",
      amount: 50000,
      customer: { email: "owner@example.com" },
    };
  assert.equal(confirmed(receipt, request, stored), true);
  for (const change of [
    { status: "failed" },
    { reference: "another" },
    { currency: "USD" },
    { amount: 1 },
    { customer: { email: "another@example.com" } },
  ])
    assert.equal(confirmed({ ...receipt, ...change }, request, stored), false);
});
test("only Super Admin can configure paid products", async () => {
  const svc = createPaymentService({
    db: {
      query: () => {
        throw Error("must not write");
      },
    },
  });
  await assert.rejects(
    svc.configure({ id: 9, user_type: "tenant" }, "registry", {
      description: "Changed by customer",
    }),
    /Only Super Admin/,
  );
});
test("missing checkout credentials fail before creating a charge", async () => {
  const svc = createPaymentService({
    env: {},
    db: {
      query: () => {
        throw Error("must not write");
      },
    },
  });
  await assert.rejects(
    svc.request({ id: 1 }, 1, {}),
    /No payment has been created/,
  );
});
test("no default price and no matched location rule means service is unavailable", async () => {
  const svc = createPaymentService({
    db: {
      query: async () => ({
        rows: [
          {
            code: "registry",
            enabled: true,
            available_states: [],
            description: "Defined service",
          },
        ],
      }),
    },
    protection: {
      access: async () => ({ p: { state_id: 1, lga_name: "Ikeja" } }),
    },
    pricing: async () => ({ amount: 500, currency: "NGN", matched_rule: null }),
  });
  assert.equal((await svc.catalogue({ id: 1 }, 1))[0].available, false);
});
test("UUID validation rejects path fragments and unrelated identifiers", () => {
  assert.equal(p.uuid("../private"), false);
  assert.equal(p.uuid("23"), false);
  assert.equal(p.uuid("66322932-6e12-4e02-b315-739c3b1f91f9"), true);
});

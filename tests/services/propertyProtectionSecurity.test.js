const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { serialize, createBridge } = require("../../services/callStateBridge");
const {
  ROOT,
  createVault,
  filePath,
} = require("../../services/propertyProtectionVault");
test("call storage keeps meeting metadata and excludes media, signalling, tokens and timers", () => {
  const call = serialize({
    id: crypto.randomUUID(),
    caller: { id: 1, full_name: "One" },
    receiver: { id: 2 },
    disputeId: 3,
    status: "accepted",
    callType: "video",
    sdp: "private SDP",
    audio: "private",
    video: "private",
    token: "secret",
    timeoutId: 99,
  });
  assert.equal(call.disputeId, 3);
  for (const key of ["sdp", "audio", "video", "token", "timeoutId"])
    assert.equal(call[key], undefined);
});
test("case closure ends every matching stored meeting and alerts its participants", async () => {
  const id = crypto.randomUUID(),
    writes = [],
    events = [];
  const bridge = createBridge({
    db: {
      query: async (sql, args) => {
        writes.push({ sql, args });
        return {
          rows: sql.startsWith("SELECT")
            ? [
                {
                  id,
                  room_state: {
                    id,
                    caller: { id: 1 },
                    receiver: { id: 2 },
                    participants: [{ id: 3 }],
                    disputeId: 4,
                    status: "accepted",
                  },
                },
              ]
            : [],
        };
      },
    },
    emit: (...args) => events.push(args),
  });
  await bridge.endCaseCalls(4, 3);
  assert.ok(writes.some((x) => x.sql.includes("status='ended'")));
  assert.equal(events.length, 3);
  assert.ok(events.every((x) => x[1] === "call:ended" && x[2].disputeId === 4));
});
test("removing someone who is not in a meeting does not end that meeting", async () => {
  const writes = [];
  const bridge = createBridge({
    db: {
      query: async (sql, args) => {
        writes.push(sql);
        return {
          rows: [
            {
              id: crypto.randomUUID(),
              room_state: { caller: { id: 1 }, receiver: { id: 2 } },
            },
          ],
        };
      },
    },
  });
  await bridge.endCaseCalls(4, 99);
  assert.equal(writes.length, 1);
});
test("private evidence path rejects traversal and executable filenames", () => {
  for (const filename of [
    "../secret.env",
    "file.pdf",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.js",
  ])
    assert.throws(() => filePath(filename), /invalid/);
});
test("unavailable malware scanning rejects and deletes an unaccepted evidence file", async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const name = crypto.randomUUID() + ".pdf",
    file = path.join(ROOT, name);
  fs.writeFileSync(file, "%PDF-1.4\nTest evidence");
  let writes = 0;
  const vault = createVault({
    db: {
      query: async () => {
        writes++;
        return { rows: [] };
      },
    },
    protection: { access: async () => ({ owner: true, p: { owner_id: 1 } }) },
    scan: async () => ({ scanned: false, infected: false }),
    audit: async () => {},
  });
  try {
    await assert.rejects(
      vault.upload(
        { id: 1 },
        4,
        {
          path: file,
          mimetype: "application/pdf",
          originalname: "evidence.pdf",
          size: 24,
        },
        { kind: "deed", retention_consent: true, retain_until: "2099-01-01" },
      ),
      /scanning is temporarily unavailable/,
    );
    assert.equal(fs.existsSync(file), false);
    assert.equal(writes, 0);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});
test("an unrelated customer cannot download private property evidence", async () => {
  const vault = createVault({
    db: { query: async () => ({ rows: [{ property_id: 4, uploaded_by: 1 }] }) },
    protection: {
      access: async () => {
        throw Object.assign(Error("Property record not found"), {
          status: 404,
        });
      },
    },
  });
  await assert.rejects(
    vault.download({ id: 2 }, crypto.randomUUID()),
    /not found/,
  );
});

test('real-time socket configuration starts with the project logger and namespaces', () => {
  const { execFileSync } = require('node:child_process');
  const output = execFileSync(process.execPath, ['-e', `const configure=require('./config/utils/realtimeSocket');const guest={use(){},on(){}};const result=configure({use(){},on(){},of(){return guest}});if(result.guestNsp!==guest)throw Error('Guest namespace missing');console.log('SOCKET_CONFIGURATION_PASS');`], { cwd: path.resolve(__dirname, '../..'), env: {...process.env, NODE_ENV:'test'}, encoding:'utf8', timeout:10000 });
  assert.match(output, /SOCKET_CONFIGURATION_PASS/);
});

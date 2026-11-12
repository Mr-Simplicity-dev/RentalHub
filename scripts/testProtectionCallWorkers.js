const assert = require("node:assert/strict"),
  http = require("http"),
  crypto = require("crypto");
const { createBridge } = require("../services/callStateBridge");
module.exports = async (db, caseId) => {
  const { Server } = require("socket.io"),
    { io: connect } = require("socket.io-client"),
    { createAdapter } = require("@socket.io/postgres-adapter");
  const name = (await db.query("SELECT current_database() AS name")).rows[0]
    .name;
  if (!/^rentalhub_protection_review_/.test(name))
    throw Error("Cross-worker test requires the isolated review database.");
  const httpOne = http.createServer(),
    httpTwo = http.createServer(),
    one = new Server(httpOne, { transports: ["websocket"] }),
    two = new Server(httpTwo, { transports: ["websocket"] });
  one.adapter(createAdapter(db, { channelPrefix: "review." + name }));
  two.adapter(createAdapter(db, { channelPrefix: "review." + name }));
  const listen = (server) =>
    new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const once = (socket, event) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Timed out waiting for " + event)),
        8000,
      );
      socket.once(event, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  let client, bridgeOne, bridgeTwo;
  try {
    two.on("connection", (socket) => {
      socket.join("review-user:2");
      socket.emit("review:ready");
    });
    await Promise.all([listen(httpOne), listen(httpTwo)]);
    client = connect("http://127.0.0.1:" + httpTwo.address().port, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false,
    });
    const ready = once(client, "review:ready");
    client.connect();
    await ready;
    const received = once(client, "review:notice");
    one.to("review-user:2").emit("review:notice", { caseId });
    assert.equal((await received).caseId, caseId);
    console.log(
      "PASS two server workers deliver room notifications through PostgreSQL",
    );
    let update;
    const changed = new Promise((resolve) => {
      update = resolve;
    });
    bridgeOne = createBridge({
      db,
      emit: (id, event, payload) =>
        one.to("review-user:" + id).emit(event, payload),
    });
    bridgeTwo = createBridge({
      db,
      onUpdate: (state) => {
        if (state.status === "accepted") update(state);
      },
    });
    await Promise.all([bridgeOne.start(), bridgeTwo.start()]);
    const id = crypto.randomUUID();
    await db.query(
      "INSERT INTO call_sessions(id,status,dispute_id) VALUES($1,'accepted',$2)",
      [id, caseId],
    );
    await bridgeOne.save({
      id,
      caller: { id: 1 },
      receiver: { id: 2 },
      disputeId: caseId,
      status: "accepted",
      callType: "video",
      sdp: "must never be stored",
    });
    const loaded = await Promise.race([
      changed,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(Error("Call state did not reach the other worker")),
          8000,
        ).unref(),
      ),
    ]);
    assert.equal(loaded.id, id);
    assert.equal(loaded.sdp, undefined);
    const ended = once(client, "call:ended");
    await bridgeOne.endCaseCalls(caseId, 2);
    assert.equal((await ended).callId, id);
    assert.equal((await bridgeTwo.load(id)).status, "ended");
    console.log(
      "PASS case meeting state and revocation reach a different worker without storing media or SDP",
    );
  } finally {
    client?.disconnect();
    await Promise.all([bridgeOne?.stop(), bridgeTwo?.stop()]);
    await Promise.all([
      new Promise((resolve) => one.close(resolve)),
      new Promise((resolve) => two.close(resolve)),
    ]);
  }
};

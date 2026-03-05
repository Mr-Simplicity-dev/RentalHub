import React from "react";

const BroadcastTab = ({
  broadcastForm,
  setBroadcastForm,
  sendBroadcast,
  broadcasts
}) => {

  return (
    <div className="space-y-6 animate-fadeIn">

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">

        <h3 className="font-semibold mb-3">
          Send Broadcast
        </h3>

        <input
          className="input mb-2 w-full"
          placeholder="Title"
          value={broadcastForm.title}
          onChange={(e) =>
            setBroadcastForm({
              ...broadcastForm,
              title: e.target.value
            })
          }
        />

        <textarea
          className="input mb-2 w-full h-24"
          placeholder="Message"
          value={broadcastForm.message}
          onChange={(e) =>
            setBroadcastForm({
              ...broadcastForm,
              message: e.target.value
            })
          }
        />

        <select
          className="input mb-3 w-full"
          value={broadcastForm.target_role}
          onChange={(e) =>
            setBroadcastForm({
              ...broadcastForm,
              target_role: e.target.value
            })
          }
        >
          <option value="">Everyone</option>
          <option value="tenant">Tenants</option>
          <option value="landlord">Landlords</option>
          <option value="admin">Admins</option>
        </select>

        <button
          onClick={sendBroadcast}
          className="btn btn-primary"
        >
          Send
        </button>

      </div>


      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">

        <h3 className="font-semibold mb-3">
          Previous Broadcasts
        </h3>

        <ul className="space-y-3 text-sm">

          {broadcasts.map((b) => (

            <li key={b.id} className="border-b border-soft pb-2 transition hover:bg-gray-50">

              <strong>
                {b.title}
              </strong>

              <div className="text-gray-600">
                {b.message}
              </div>

              <div className="text-xs text-gray-400">

                To: {b.target_role || "Everyone"} |

                {" "}By {b.sender_name} |

                {" "}
                {new Date(b.created_at).toLocaleString()}

              </div>

            </li>

          ))}

        </ul>

      </div>

    </div>
  );
};

export default BroadcastTab;

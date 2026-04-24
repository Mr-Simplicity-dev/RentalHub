import React, { useEffect, useMemo, useState } from "react";
import PaginationControls from "./PaginationControls";

const BROADCASTS_PAGE_SIZE = 8;

const BroadcastTab = ({
  broadcastForm,
  setBroadcastForm,
  sendBroadcast,
  broadcasts
}) => {
  const [broadcastPage, setBroadcastPage] = useState(1);

  const totalBroadcastPages = useMemo(
    () => Math.max(Math.ceil((broadcasts?.length || 0) / BROADCASTS_PAGE_SIZE), 1),
    [broadcasts]
  );

  const pagedBroadcasts = useMemo(() => {
    const start = (broadcastPage - 1) * BROADCASTS_PAGE_SIZE;
    return (broadcasts || []).slice(start, start + BROADCASTS_PAGE_SIZE);
  }, [broadcasts, broadcastPage]);

  useEffect(() => {
    setBroadcastPage(1);
  }, [broadcasts?.length]);

  useEffect(() => {
    if (broadcastPage > totalBroadcastPages) {
      setBroadcastPage(totalBroadcastPages);
    }
  }, [broadcastPage, totalBroadcastPages]);

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

          {pagedBroadcasts.map((b) => (

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

        <PaginationControls
          currentPage={broadcastPage}
          totalPages={totalBroadcastPages}
          onPageChange={setBroadcastPage}
          summary={`Showing ${(broadcasts?.length || 0) === 0 ? 0 : (broadcastPage - 1) * BROADCASTS_PAGE_SIZE + 1}-${Math.min(broadcastPage * BROADCASTS_PAGE_SIZE, broadcasts?.length || 0)} of ${broadcasts?.length || 0}`}
        />

      </div>

    </div>
  );
};

export default BroadcastTab;

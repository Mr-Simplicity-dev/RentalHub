import React from "react";
import useAdminNotifications from "../../hooks/useAdminNotifications";

const AdminNotifications = () => {

  const notifications = useAdminNotifications();

  return (

    <div className="fixed bottom-6 right-6 space-y-3 z-50">

      {notifications.slice(0,3).map((n) => (

        <div
          key={n.id}
          className="bg-white border border-soft shadow-card rounded-lg px-4 py-3 animate-fadeIn"
        >

          <p className="text-sm font-medium">
            {n.message}
          </p>

        </div>

      ))}

    </div>

  );

};

export default AdminNotifications;
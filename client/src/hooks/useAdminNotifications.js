import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io(process.env.REACT_APP_API_URL);

export default function useAdminNotifications() {

  const [notifications, setNotifications] = useState([]);

  useEffect(() => {

    socket.on("admin_notification", (data) => {

      setNotifications((prev) => [
        { id: Date.now(), ...data },
        ...prev,
      ]);

    });

    return () => socket.off("admin_notification");

  }, []);

  return notifications;
}
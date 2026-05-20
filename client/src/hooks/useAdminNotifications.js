import { useEffect, useState } from "react";
import { useSocket } from "./useSocket";

export default function useAdminNotifications() {

  const [notifications, setNotifications] = useState([]);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return undefined;

    socket.on("admin_notification", (data) => {

      setNotifications((prev) => [
        { id: Date.now(), ...data },
        ...prev,
      ]);

    });

    return () => socket.off("admin_notification");

  }, [socket]);

  return notifications;
}

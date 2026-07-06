let ioInstance = null;

const setRealtimeIo = (io) => {
  ioInstance = io;
};

const getRealtimeIo = () => ioInstance;

const emitToUser = (userId, eventName, payload) => {
  if (!ioInstance || !userId || !eventName) {
    return false;
  }

  ioInstance.to(`user:${userId}`).emit(eventName, payload);
  return true;
};

const emitToRole = (role, eventName, payload) => {
  if (!ioInstance || !role || !eventName) {
    return false;
  }

  ioInstance.to(`role:${role}`).emit(eventName, payload);
  return true;
};

module.exports = {
  emitToRole,
  emitToUser,
  getRealtimeIo,
  setRealtimeIo,
};

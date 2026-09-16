// Recipient-specific notification service
const notifications = [];

const sendNotification = ({ recipientUserId, title, message, type = 'INFO', metadata = {} }) => {
  const notif = {
    id: `NOTIF-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    recipientUserId: recipientUserId.toString(),
    title,
    message,
    type,
    metadata,
    read: false,
    createdAt: new Date().toISOString()
  };
  notifications.push(notif);
  if (notifications.length > 500) notifications.shift(); // Keep last 500 in ring buffer
  return notif;
};

const getNotificationsForUser = (userId) => {
  return notifications
    .filter(n => n.recipientUserId === userId.toString())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const markAsRead = (notifId, userId) => {
  const notif = notifications.find(n => n.id === notifId && n.recipientUserId === userId.toString());
  if (notif) notif.read = true;
  return notif;
};

module.exports = {
  sendNotification,
  getNotificationsForUser,
  markAsRead
};
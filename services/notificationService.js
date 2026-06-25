const db = require('../config/middleware/database');
const { sendEmail } = require('../config/utils/mailer');
const { getFrontendUrl } = require('../config/utils/frontendUrl');

const money = (value) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const sendTenantEmail = async ({ to, name, subject, message, path = '/fumigation-cleaning/bookings' }) => {
  if (!to) return;
  try {
    const url = `${getFrontendUrl()}${path}`;
    await sendEmail({
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h2 style="margin-bottom: 8px;">${subject}</h2>
          <p>Hello ${name || 'there'},</p>
          <p>${message}</p>
          <p><a href="${url}" style="color: #2563eb;">Open your booking</a></p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Fumigation notification email error (non-fatal):', error.message || error);
  }
};

class NotificationService {
  // Send booking confirmation notification
  static async sendBookingConfirmation(data) {
    try {
      const { tenantId, bookingId, bookingReference, serviceType } = data;
      
      // Get tenant details
      const tenantResult = await db.query(
        'SELECT full_name, email, phone FROM users WHERE id = $1',
        [tenantId]
      );
      
      if (tenantResult.rows.length === 0) {
        console.error('Tenant not found for notification:', tenantId);
        return false;
      }
      
      const tenant = tenantResult.rows[0];
      
      // Create notification record in database
      await db.query(
        `INSERT INTO notifications (
          user_id, 
          title, 
          message, 
          type, 
          related_id, 
          related_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          'Booking Confirmation',
          `Your ${serviceType} booking #${bookingReference} has been confirmed. Our team will contact you soon.`,
          'booking_confirmation',
          bookingId,
          'fumigation_cleaning_booking'
        ]
      );
      
      await sendTenantEmail({
        to: tenant.email,
        name: tenant.full_name,
        subject: 'Fumigation/Cleaning booking received',
        message: `Your ${serviceType?.replace(/_/g, ' ') || 'fumigation/cleaning'} booking #${bookingReference} has been received. Our operations team will confirm the schedule and provider assignment.`,
        path: `/fumigation-cleaning/bookings/${bookingId}`,
      });
      
      return true;
    } catch (error) {
      console.error('Error sending booking confirmation notification:', error);
      return false;
    }
  }

  // Send booking cancellation notification
  static async sendBookingCancellation(data) {
    try {
      const { tenantId, bookingId, bookingReference, cancellationFee } = data;
      
      // Get tenant details
      const tenantResult = await db.query(
        'SELECT full_name, email FROM users WHERE id = $1',
        [tenantId]
      );
      
      if (tenantResult.rows.length === 0) {
        console.error('Tenant not found for cancellation notification:', tenantId);
        return false;
      }
      
      const tenant = tenantResult.rows[0];
      
      // Create notification record
      await db.query(
        `INSERT INTO notifications (
          user_id, 
          title, 
          message, 
          type, 
          related_id, 
          related_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          'Booking Cancelled',
          cancellationFee > 0 
            ? `Your booking #${bookingReference} has been cancelled. A cancellation fee of ₦${cancellationFee} applies.`
            : `Your booking #${bookingReference} has been cancelled successfully.`,
          'booking_cancellation',
          bookingId,
          'fumigation_cleaning_booking'
        ]
      );
      
      await sendTenantEmail({
        to: tenant.email,
        name: tenant.full_name,
        subject: 'Fumigation/Cleaning booking cancelled',
        message: cancellationFee > 0
          ? `Your booking #${bookingReference} has been cancelled. A cancellation fee of ${money(cancellationFee)} applies.`
          : `Your booking #${bookingReference} has been cancelled successfully.`,
        path: `/fumigation-cleaning/bookings/${bookingId}`,
      });
      
      return true;
    } catch (error) {
      console.error('Error sending booking cancellation notification:', error);
      return false;
    }
  }

  // Send payment confirmation notification
  static async sendPaymentConfirmation(data) {
    try {
      const { tenantId, bookingId, amount, paymentReference } = data;
      
      // Get tenant details
      const tenantResult = await db.query(
        'SELECT full_name, email FROM users WHERE id = $1',
        [tenantId]
      );
      
      if (tenantResult.rows.length === 0) {
        console.error('Tenant not found for payment notification:', tenantId);
        return false;
      }
      
      const tenant = tenantResult.rows[0];
      
      // Create notification record
      await db.query(
        `INSERT INTO notifications (
          user_id, 
          title, 
          message, 
          type, 
          related_id, 
          related_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          'Payment Confirmed',
          `Payment of ₦${amount} for booking #${bookingId} has been confirmed. Reference: ${paymentReference}`,
          'payment_confirmation',
          bookingId,
          'fumigation_cleaning_booking'
        ]
      );
      
      await sendTenantEmail({
        to: tenant.email,
        name: tenant.full_name,
        subject: 'Fumigation/Cleaning payment confirmed',
        message: `Your payment of ${money(amount)} for booking #${bookingId} has been confirmed. Reference: ${paymentReference}.`,
        path: `/fumigation-cleaning/bookings/${bookingId}`,
      });
      
      return true;
    } catch (error) {
      console.error('Error sending payment confirmation notification:', error);
      return false;
    }
  }

  // Send booking status update notification
  static async sendBookingStatusUpdate(data) {
    try {
      const { tenantId, bookingId, bookingReference, newStatus, updateDetails } = data;
      
      // Get tenant details
      const tenantResult = await db.query(
        'SELECT full_name, email FROM users WHERE id = $1',
        [tenantId]
      );
      
      if (tenantResult.rows.length === 0) {
        console.error('Tenant not found for status update notification:', tenantId);
        return false;
      }
      
      const tenant = tenantResult.rows[0];
      
      const statusMessages = {
        'confirmed': 'has been confirmed and a service provider has been assigned',
        'scheduled': 'has been scheduled',
        'in_progress': 'is now in progress',
        'completed': 'has been completed',
        'rescheduled': 'has been rescheduled'
      };
      
      const message = statusMessages[newStatus] || `status has been updated to ${newStatus}`;
      
      // Create notification record
      await db.query(
        `INSERT INTO notifications (
          user_id, 
          title, 
          message, 
          type, 
          related_id, 
          related_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          'Booking Status Update',
          `Your booking #${bookingReference} ${message}.`,
          'booking_status_update',
          bookingId,
          'fumigation_cleaning_booking'
        ]
      );
      
      await sendTenantEmail({
        to: tenant.email,
        name: tenant.full_name,
        subject: 'Fumigation/Cleaning booking update',
        message: `Your booking #${bookingReference} ${message}.${updateDetails?.admin_note ? ` Note: ${updateDetails.admin_note}` : ''}`,
        path: `/fumigation-cleaning/bookings/${bookingId}`,
      });
      
      return true;
    } catch (error) {
      console.error('Error sending booking status update notification:', error);
      return false;
    }
  }

  // Send provider assignment notification
  static async sendProviderAssignment(data) {
    try {
      const { tenantId, bookingId, bookingReference, providerName, contactPerson, contactPhone } = data;
      
      // Get tenant details
      const tenantResult = await db.query(
        'SELECT full_name, email, phone FROM users WHERE id = $1',
        [tenantId]
      );
      
      if (tenantResult.rows.length === 0) {
        console.error('Tenant not found for provider assignment notification:', tenantId);
        return false;
      }
      
      const tenant = tenantResult.rows[0];
      
      // Create notification record
      await db.query(
        `INSERT INTO notifications (
          user_id, 
          title, 
          message, 
          type, 
          related_id, 
          related_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          'Service Provider Assigned',
          `Provider ${providerName} has been assigned to your booking #${bookingReference}. Contact: ${contactPerson} (${contactPhone})`,
          'provider_assignment',
          bookingId,
          'fumigation_cleaning_booking'
        ]
      );
      
      await sendTenantEmail({
        to: tenant.email,
        name: tenant.full_name,
        subject: 'Fumigation/Cleaning provider assigned',
        message: `Provider ${providerName} has been assigned to your booking #${bookingReference}. Contact: ${contactPerson}${contactPhone ? ` (${contactPhone})` : ''}.`,
        path: `/fumigation-cleaning/bookings/${bookingId}`,
      });
      
      return true;
    } catch (error) {
      console.error('Error sending provider assignment notification:', error);
      return false;
    }
  }

  // Send general notification
  static async sendNotification(userId, title, message, type = 'general', relatedId = null, relatedType = null) {
    try {
      await db.query(
        `INSERT INTO notifications (
          user_id, 
          title, 
          message, 
          type, 
          related_id, 
          related_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, title, message, type, relatedId, relatedType]
      );
      
      return true;
    } catch (error) {
      console.error('Error sending notification:', error);
      return false;
    }
  }

  // Get user notifications
  static async getUserNotifications(userId, limit = 20, offset = 0) {
    try {
      const result = await db.query(
        `SELECT * FROM notifications 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return [];
    }
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    try {
      const result = await db.query(
        `UPDATE notifications 
         SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND user_id = $2 
         RETURNING *`,
        [notificationId, userId]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return null;
    }
  }

  // Mark all notifications as read for user
  static async markAllAsRead(userId) {
    try {
      const result = await db.query(
        `UPDATE notifications 
         SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
         WHERE user_id = $1 AND is_read = FALSE 
         RETURNING COUNT(*) as count`,
        [userId]
      );
      
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return 0;
    }
  }

  // Get unread notification count
  static async getUnreadCount(userId) {
    try {
      const result = await db.query(
        `SELECT COUNT(*) as count FROM notifications 
         WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
      );
      
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting unread notification count:', error);
      return 0;
    }
  }
}

module.exports = NotificationService;

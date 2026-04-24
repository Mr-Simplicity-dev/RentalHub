const db = require('../config/middleware/database');

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
      
      // Log the notification (in production, you would send email/SMS here)
      console.log(`Booking confirmation sent to tenant ${tenant.full_name} (${tenant.email})`);
      console.log(`Booking ID: ${bookingId}, Reference: ${bookingReference}`);
      
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
      
      console.log(`Booking cancellation sent to tenant ${tenant.full_name}`);
      
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
      
      console.log(`Payment confirmation sent to tenant ${tenant.full_name}`);
      
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
      
      console.log(`Booking status update sent to tenant ${tenant.full_name}: ${newStatus}`);
      
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
      
      console.log(`Provider assignment sent to tenant ${tenant.full_name}`);
      
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
      
      console.log(`Notification sent to user ${userId}: ${title}`);
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
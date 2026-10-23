const db = require('../config/middleware/database');
const virtualAccountService = require('../services/virtualAccountService');

const fail = (res, error) => {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: status >= 500 ? 'Payment account request failed' : error.message,
  });
};

exports.getConfig = (req, res) => {
  res.json({ success: true, data: virtualAccountService.getConfig() });
};

exports.getWalletAccount = async (req, res) => {
  try {
    const result = await virtualAccountService.getWalletAccountForUser({
      userId: req.user.id,
      logger: req.logger || console,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    (req.logger || console).error('Wallet virtual account error:', error.message);
    fail(res, error);
  }
};

exports.getWalletCredits = async (req, res) => {
  try {
    const credits = await virtualAccountService.getWalletCredits({
      userId: req.user.id,
      limit: req.query.limit,
    });

    res.json({ success: true, data: { credits } });
  } catch (error) {
    fail(res, error);
  }
};

exports.createRegistrationAccount = async (req, res) => {
  try {
    const reference = String(req.body.reference || '').trim();

    const result = await db.query(
      `SELECT transaction_reference, amount, payment_status, registered_user_id,
              email, full_name, registration_payload
       FROM tenant_registration_payments
       WHERE transaction_reference = $1
       LIMIT 1`,
      [reference]
    );

    const registration = result.rows[0];
    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration payment not found' });
    }

    if (registration.registered_user_id || registration.payment_status === 'completed') {
      return res.status(409).json({
        success: false,
        message: 'This registration payment is already completed',
      });
    }

    const transfer = await virtualAccountService.createRegistrationAccount({
      registration,
      logger: req.logger || console,
    });

    if (!transfer.available) {
      return res.status(409).json({
        success: false,
        code: transfer.reason === 'provider_error' ? 'PROVIDER_UNAVAILABLE' : 'VIRTUAL_ACCOUNT_UNAVAILABLE',
        message: transfer.message || 'Automatic transfer account is not available',
        data: transfer,
      });
    }

    res.json({
      success: true,
      message: 'Transfer to the account below. It is confirmed automatically.',
      data: {
        reference,
        amount: Number(registration.amount),
        virtual_account: transfer.account,
        auto_confirm: true,
      },
    });
  } catch (error) {
    (req.logger || console).error('Registration virtual account error:', error.message);
    fail(res, error);
  }
};

exports.getRegistrationStatus = async (req, res) => {
  try {
    const reference = String(req.params.reference || '').trim();

    let status = await virtualAccountService.getRegistrationAccountStatus({ reference });

    if (status.available && !status.paid) {
      // Webhooks can be delayed or dropped, so a status poll also asks the
      // provider directly before answering. Safe to repeat: crediting is
      // idempotent.
      try {
        const reconciled = await virtualAccountService.reconcileRegistration({
          reference,
          logger: req.logger || console,
        });
        if (reconciled.status !== 'unpaid' && reconciled.status !== 'query_failed') {
          status = await virtualAccountService.getRegistrationAccountStatus({ reference });
        }
      } catch (error) {
        (req.logger || console).error('Registration reconciliation error:', error.message);
      }
    }

    res.json({ success: true, data: status });
  } catch (error) {
    fail(res, error);
  }
};

exports.webhook = async (req, res) => {
  try {
    const result = await virtualAccountService.handleWebhook({
      providerName: req.params.provider,
      rawBody: req.rawBody,
      body: req.body,
      headers: req.headers,
      query: req.query,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    (req.logger || console).error('Virtual account webhook error:', error.message);
    if (error.statusCode === 401 || error.statusCode === 404) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    // Non-2xx makes the provider retry; the event row stays unprocessed.
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

const baseUrl = process.env.BASE_URL || 'https://rentalhub.com.ng';

const responsiveWrapper = (content, { title = 'RentalHub NG', previewText = '', unsubscribeUrl = '' } = {}) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table { border-collapse: collapse; }
    td { font-family: 'Segoe UI', Tahoma, Verdana, sans-serif; }
  </style>
  <![endif]-->
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { -webkit-font-smoothing: antialiased; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse; }
    .ExternalClass, .ReadMsgBody { width: 100%; }
    .ExternalClass p, .ExternalClass span, .ExternalClass td { line-height: 100%; }
    @media only screen and (max-width: 600px) {
      .responsive-table { width: 100% !important; }
      .responsive-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .responsive-stack { display: block !important; width: 100% !important; }
      .responsive-center { text-align: center !important; }
      .responsive-hide { display: none !important; }
      .responsive-button { width: 100% !important; display: block !important; }
      .responsive-button a { display: block !important; width: 100% !important; }
      .responsive-text { font-size: 15px !important; }
      .responsive-h2 { font-size: 22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  ${previewText ? `<!--[if !mso]><!-- --><div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div><!--<![endif]-->` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" class="responsive-table" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:0 0 20px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:10px 0;">
                    <a href="${baseUrl}" target="_blank" style="text-decoration:none;">
                      <img src="${baseUrl}/logo.png" alt="RentalHub NG" width="180" height="auto" style="display:block;max-width:180px;height:auto;border:0;">
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:12px;color:#94a3b8;padding-top:4px;">
                    Nigeria's Trusted Property Platform
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background-color:#ffffff;border-radius:12px;padding:0;" class="responsive-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:40px 40px 30px 40px;" class="responsive-padding">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 20px 12px 20px;font-size:12px;line-height:1.5;color:#94a3b8;">
                    &copy; ${new Date().getFullYear()} RentalHub NG. All rights reserved.
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 20px 8px 20px;font-size:12px;line-height:1.5;color:#94a3b8;">
                    You received this email because you're subscribed to RentalHub communications.
                  </td>
                </tr>
                ${unsubscribeUrl ? `
                <tr>
                  <td align="center" style="padding:0 20px 20px 20px;font-size:12px;">
                    <a href="${unsubscribeUrl}" target="_blank" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
                  </td>
                </tr>
                ` : ''}
                <tr>
                  <td align="center" style="padding:0 20px 20px 20px;font-size:11px;line-height:1.5;color:#cbd5e1;">
                    RentalHub NG, Nigeria
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const newsletterContent = ({ title, body, ctaText, ctaUrl, highlights = [], imageUrl = '' }) => {
  const highlightsHtml = highlights.length > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${highlights.map((h, i) => `
            <tr>
              <td style="padding:${i > 0 ? '12px 0 0 0' : '0'};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td width="24" valign="top" style="padding:2px 0 0 0;width:24px;">
                            <img src="${baseUrl}/icons/check.png" alt="" width="20" height="20" style="display:block;width:20px;height:auto;">
                          </td>
                          <td style="padding:0 0 0 12px;font-size:14px;line-height:1.5;color:#475569;">
                            ${h}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            `).join('')}
          </table>
        </td>
      </tr>
    </table>
  ` : '';

  const imageHtml = imageUrl ? `
    <tr>
      <td style="padding:0 0 24px 0;">
        <img src="${imageUrl}" alt="" width="100%" style="display:block;width:100%;max-width:520px;height:auto;border-radius:8px;">
      </td>
    </tr>
  ` : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${imageHtml}
      <tr>
        <td style="padding:0 0 16px 0;">
          <h2 class="responsive-h2" style="margin:0;font-size:24px;font-weight:700;color:#0f172a;line-height:1.3;">
            ${title}
          </h2>
        </td>
      </tr>
      <tr>
        <td class="responsive-text" style="font-size:15px;line-height:1.7;color:#475569;">
          ${body}
        </td>
      </tr>
      ${highlightsHtml}
      ${ctaText && ctaUrl ? `
      <tr>
        <td style="padding:24px 0 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" class="responsive-button">
                  <tr>
                    <td align="center" style="background-color:#0284c7;border-radius:8px;" class="responsive-button">
                      <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#0284c7;">
                        ${ctaText}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      ` : ''}
    </table>
  `;
};

const promoContent = ({ title, body, discount, code, ctaText, ctaUrl, expiryDate }) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:0 0 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0284c7,#0ea5e9);border-radius:12px;width:100%;">
          <tr>
            <td align="center" style="padding:30px 20px;">
              ${discount ? `<div style="font-size:48px;font-weight:800;color:#ffffff;line-height:1;margin-bottom:4px;">${discount}</div>` : ''}
              <div style="font-size:16px;font-weight:600;color:#e0f2fe;margin-top:8px;">${title}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="responsive-text" style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
        ${body}
      </td>
    </tr>
    ${code ? `
    <tr>
      <td align="center" style="padding:0 0 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:2px dashed #16a34a;border-radius:8px;">
          <tr>
            <td style="padding:12px 32px;font-size:22px;font-weight:700;color:#16a34a;letter-spacing:3px;font-family:monospace;">
              ${code}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ` : ''}
    ${expiryDate ? `
    <tr>
      <td style="font-size:13px;color:#94a3b8;padding:0 0 16px 0;text-align:center;">
        Offer expires ${expiryDate}
      </td>
    </tr>
    ` : ''}
    ${ctaText && ctaUrl ? `
    <tr>
      <td align="center" style="padding:8px 0 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="responsive-button">
          <tr>
            <td align="center" style="background-color:#0284c7;border-radius:8px;">
              <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#0284c7;">
                ${ctaText}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ` : ''}
  </table>
`;

const propertyAlertContent = ({ properties = [], message = '' }) => {
  const propertyCards = properties.map((p) => `
    <tr>
      <td style="padding:0 0 16px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          ${p.image ? `
          <tr>
            <td>
              <a href="${baseUrl}/properties/${p.id}" target="_blank">
                <img src="${p.image}" alt="${p.title}" width="100%" style="display:block;width:100%;height:180px;object-fit:cover;border:0;">
              </a>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding:16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <a href="${baseUrl}/properties/${p.id}" target="_blank" style="font-size:16px;font-weight:600;color:#0f172a;text-decoration:none;">
                      ${p.title}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0 0 0;font-size:13px;color:#64748b;">
                    ${p.location || ''} ${p.state ? `- ${p.state}` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0 0 0;font-size:15px;font-weight:700;color:#0284c7;">
                    ${p.price || ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${message ? `
      <tr>
        <td class="responsive-text" style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
          ${message}
        </td>
      </tr>
      ` : ''}
      ${propertyCards}
      <tr>
        <td align="center" style="padding:8px 0 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" class="responsive-button">
            <tr>
              <td align="center" style="background-color:#0284c7;border-radius:8px;">
                <a href="${baseUrl}/properties" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#0284c7;">
                  View All Properties
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
};

const reEngagementContent = ({ name, daysSinceLastVisit, ctaUrl }) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:0 0 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:50%;width:80px;height:80px;">
          <tr>
            <td align="center" valign="middle" style="font-size:36px;">
              👋
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 12px 0;">
        <h2 class="responsive-h2" style="margin:0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;text-align:center;">
          We Miss You, ${name}!
        </h2>
      </td>
    </tr>
    <tr>
      <td class="responsive-text" style="font-size:15px;line-height:1.7;color:#475569;text-align:center;padding:0 0 8px 0;">
        It's been <strong>${daysSinceLastVisit} days</strong> since your last visit. New properties have been added that might interest you!
      </td>
    </tr>
    <tr>
      <td style="padding:20px 0 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:8px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" class="responsive-button">
                <tr>
                  <td align="center" style="background-color:#0284c7;border-radius:8px;">
                    <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#0284c7;">
                      Browse New Properties
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`;

const buildEmail = ({ template, data, unsubscribeToken }) => {
  const unsubscribeUrl = unsubscribeToken
    ? `${baseUrl}/email/unsubscribe?token=${unsubscribeToken}`
    : '';

  let content = '';
  let title = 'RentalHub NG';
  let previewText = '';

  switch (template) {
    case 'newsletter':
      title = data.title || 'RentalHub Newsletter';
      previewText = data.previewText || 'Latest updates from RentalHub NG';
      content = newsletterContent(data);
      break;
    case 'promo':
      title = data.title || 'Special Offer';
      previewText = data.previewText || 'Exclusive offer just for you';
      content = promoContent(data);
      break;
    case 'property_alert':
      title = 'New Properties Available';
      previewText = 'Properties you might like';
      content = propertyAlertContent(data);
      break;
    case 're_engagement':
      title = `Welcome Back, ${data.name || 'there'}!`;
      previewText = "We haven't seen you in a while";
      content = reEngagementContent(data);
      break;
    default:
      content = data.body || '';
      title = data.title || 'RentalHub NG';
  }

  return responsiveWrapper(content, { title, previewText, unsubscribeUrl });
};

module.exports = { buildEmail, responsiveWrapper, newsletterContent, promoContent, propertyAlertContent, reEngagementContent };

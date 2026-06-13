-- Seed system email templates for Email Marketing

-- Helper to get a super admin user id (falls back to NULL)
DO $$
DECLARE
  admin_id INTEGER;
BEGIN
  SELECT id INTO admin_id FROM users WHERE user_type = 'super_admin' ORDER BY id LIMIT 1;

  -- 1. Welcome Newsletter
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Welcome to RentalHub',
    'Sent to new subscribers or newly registered users welcoming them to the platform.',
    'Welcome to RentalHub – Let''s Find Your Perfect Home',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0284c7,#0ea5e9);border-radius:12px;width:100%;">
        <tr>
          <td align="center" style="padding:36px 24px;">
            <div style="font-size:14px;font-weight:600;color:#e0f2fe;text-transform:uppercase;letter-spacing:2px;">Welcome Aboard</div>
            <div style="font-size:28px;font-weight:800;color:#ffffff;margin-top:8px;line-height:1.2;">We''re Excited to Have You</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 20px 0;font-size:15px;line-height:1.7;color:#475569;">
      Hello {{name}},
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 20px 0;font-size:15px;line-height:1.7;color:#475569;">
      Thanks for joining RentalHub — Nigeria''s most trusted property platform. We''re here to help you find, rent, or list properties with confidence.
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 16px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="24" valign="top" style="padding:2px 0 0 0;"><span style="font-size:16px;">🔍</span></td>
                      <td style="padding:0 0 0 12px;font-size:14px;color:#475569;">Browse thousands of verified properties across Nigeria</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="24" valign="top" style="padding:2px 0 0 0;"><span style="font-size:16px;">📝</span></td>
                      <td style="padding:0 0 0 12px;font-size:14px;color:#475569;">Apply to rent with a single click — no paperwork needed</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="24" valign="top" style="padding:2px 0 0 0;"><span style="font-size:16px;">🛡️</span></td>
                      <td style="padding:0 0 0 12px;font-size:14px;color:#475569;">All landlords and properties are verified for your safety</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="24" valign="top" style="padding:2px 0 0 0;"><span style="font-size:16px;">💬</span></td>
                      <td style="padding:0 0 0 12px;font-size:14px;color:#475569;">Chat directly with landlords and get instant responses</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:20px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{baseUrl}}/properties" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              Browse Properties
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'newsletter', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 2. Monthly Newsletter
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Monthly Newsletter',
    'General newsletter with platform updates, tips, and featured properties.',
    'RentalHub Monthly – {{month}} Updates',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="padding:0 0 16px 0;">
      <h2 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">{{title}}</h2>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      {{body}}
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 16px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        {{highlights}}
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;background-color:#f8fafc;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Featured Property</p>
            <p style="margin:8px 0 0 0;font-size:17px;font-weight:700;color:#0f172a;">{{featuredTitle}}</p>
            <p style="margin:4px 0 0 0;font-size:14px;color:#64748b;">{{featuredLocation}}</p>
            <p style="margin:12px 0 0 0;font-size:16px;font-weight:700;color:#0284c7;">{{featuredPrice}}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{baseUrl}}/properties" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              View All New Properties
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'newsletter', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 3. New Property Alert
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'New Property Alert',
    'Notifies subscribers about new properties matching their preferences.',
    'New Properties Available in {{location}}',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#059669,#34d399);border-radius:12px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 24px;">
            <div style="font-size:32px;">🏠</div>
            <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:8px;">New Properties Just Added</div>
            <div style="font-size:14px;color:#d1fae5;margin-top:4px;">{{location}}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      Hi {{name}}, check out these new properties we think you''ll love:
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 16px 0;">
      {{propertyCards}}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{baseUrl}}/properties" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              See All New Listings
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'property_alert', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 4. Promotional Offer
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Promotional Offer',
    'Discounts, promo codes, and limited-time offers for subscribers.',
    'Special Offer {{discount}} Off – Limited Time',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#dc2626,#f97316);border-radius:12px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 20px;">
            <div style="font-size:12px;font-weight:600;color:#fee2e2;text-transform:uppercase;letter-spacing:2px;">Limited Time Offer</div>
            <div style="font-size:44px;font-weight:800;color:#ffffff;margin-top:8px;line-height:1;">{{discount}}</div>
            <div style="font-size:16px;font-weight:600;color:#ffedd5;margin-top:8px;">{{title}}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      {{body}}
    </td>
  </tr>
  {{promoCode}}
  <tr>
    <td align="center" style="padding:0 0 8px 0;font-size:13px;color:#94a3b8;">
      Offer expires {{expiryDate}}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{ctaUrl}}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              {{ctaText}}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'promo', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 5. Re-engagement / We Miss You
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'We Miss You (Re-engagement)',
    'Sent to inactive users or subscribers to bring them back to the platform.',
    'We Miss You, {{name}} – Come Back to RentalHub',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:50%;width:80px;height:80px;margin:0 auto;">
        <tr>
          <td align="center" valign="middle" style="font-size:36px;">👋</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 12px 0;text-align:center;">
      <h2 style="margin:0;font-size:24px;font-weight:700;color:#0f172a;">We Miss You, {{name}}!</h2>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;text-align:center;padding:0 0 8px 0;">
      It''s been a while since your last visit. New properties have been added and there are great deals waiting for you.
    </td>
  </tr>
  <tr>
    <td style="padding:20px 0 16px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
              <tr>
                <td style="padding:14px 20px;font-size:14px;color:#475569;">
                  <span style="font-weight:600;">{{newProperties}}</span> new properties added this week
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
              <tr>
                <td style="padding:14px 20px;font-size:14px;color:#475569;">
                  <span style="font-weight:600;">₦{{savings}}</span> average savings with RentalHub deals
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
              <tr>
                <td style="padding:14px 20px;font-size:14px;color:#475569;">
                  Verified landlords ready to chat right now
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{baseUrl}}/properties" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              Browse New Properties
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    're_engagement', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 6. Seasonal Greeting
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Seasonal / Holiday Greeting',
    'Festive season greetings with platform updates or offers.',
    'Happy {{holiday}} from RentalHub',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1e40af,#7c3aed);border-radius:12px;width:100%;">
        <tr>
          <td align="center" style="padding:36px 24px;">
            <div style="font-size:40px;">🎄</div>
            <div style="font-size:24px;font-weight:800;color:#ffffff;margin-top:12px;">Happy {{holiday}}!</div>
            <div style="font-size:14px;color:#c4b5fd;margin-top:8px;">From all of us at RentalHub NG</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      Dear {{name}},
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      Wishing you and your family a wonderful {{holiday}} season! As we celebrate, we''re grateful to have you as part of the RentalHub community.
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      To make your {{holiday}} even brighter, here''s a special gift: use code <strong style="color:#0284c7;">{{promoCode}}</strong> to get {{discount}} off your next subscription.
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:20px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{baseUrl}}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              Visit RentalHub
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'promo', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 7. Listing Your Property Guide
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Landlord – List Your Property Guide',
    'Onboarding sequence for new landlords on how to list and manage properties.',
    'Ready to List? Here''s How to Get Started on RentalHub',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f766e,#14b8a6);border-radius:12px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 24px;">
            <div style="font-size:14px;font-weight:600;color:#ccfbf1;text-transform:uppercase;letter-spacing:2px;">Landlord Guide</div>
            <div style="font-size:24px;font-weight:800;color:#ffffff;margin-top:8px;">Start Listing in Minutes</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      Hello {{name}}, welcome to RentalHub! Here''s your quick-start guide to listing your property and finding the perfect tenant.
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td width="28" valign="top" style="font-size:16px;font-weight:700;color:#0f766e;">1.</td><td style="padding:0 0 0 12px;font-size:14px;color:#475569;">Add property photos and accurate details</td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td width="28" valign="top" style="font-size:16px;font-weight:700;color:#0f766e;">2.</td><td style="padding:0 0 0 12px;font-size:14px;color:#475569;">Set your rental price and availability</td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td width="28" valign="top" style="font-size:16px;font-weight:700;color:#0f766e;">3.</td><td style="padding:0 0 0 12px;font-size:14px;color:#475569;">Review tenant applications and approve the best fit</td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
        <tr><td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td width="28" valign="top" style="font-size:16px;font-weight:700;color:#0f766e;">4.</td><td style="padding:0 0 0 12px;font-size:14px;color:#475569;">Get paid securely through the platform</td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:24px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{baseUrl}}/dashboard" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              Go to My Dashboard
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'general', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 8. Price Drop Alert
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Price Drop Alert',
    'Notifies subscribers when a property they viewed has dropped in price.',
    'Price Drop! {{propertyTitle}} is Now {{newPrice}}',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#16a34a,#22c55e);border-radius:12px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 24px;">
            <div style="font-size:36px;">💰</div>
            <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:8px;">Price Drop Alert!</div>
            <div style="font-size:28px;font-weight:800;color:#fef08a;margin-top:4px;">{{oldPrice}} → {{newPrice}}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 12px 0;">
      Good news, {{name}}! The price has dropped on a property you were interested in.
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        {{propertyImage}}
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">{{propertyTitle}}</p>
            <p style="margin:6px 0 0 0;font-size:14px;color:#64748b;">{{propertyLocation}}</p>
            <div style="margin-top:12px;">
              <span style="font-size:14px;color:#94a3b8;text-decoration:line-through;">{{oldPrice}}</span>
              <span style="font-size:20px;font-weight:700;color:#16a34a;margin-left:8px;">{{newPrice}}</span>
            </div>
            <p style="margin:4px 0 0 0;font-size:13px;color:#16a34a;font-weight:600;">You save {{savings}}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{propertyUrl}}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              View Property
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'property_alert', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 9. Service Update / New Feature
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'New Feature Announcement',
    'Announce new platform features, services, or improvements to subscribers.',
    'New on RentalHub: {{featureName}}',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="padding:0 0 16px 0;">
      <h2 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">{{title}}</h2>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      {{body}}
    </td>
  </tr>
  {{featureImage}}
  <tr>
    <td style="padding:0 0 16px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        {{benefits}}
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{ctaUrl}}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              {{ctaText}}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'general', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 10. Plain Announcement (simple text-based)
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Simple Announcement',
    'Minimal text-based announcement for quick updates and notices.',
    '{{subject}}',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="padding:0 0 8px 0;">
      <p style="margin:0;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Announcement</p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 16px 0;">
      <h2 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">{{title}}</h2>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 20px 0;">
      {{body}}
    </td>
  </tr>
  {{ctaButton}}
</table>',
    'general', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 11. Tenant – Rent Reminder
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Tenant – Rent Due Reminder',
    'Reminder for tenants about upcoming or overdue rent payments.',
    'Rent Payment Reminder – {{propertyTitle}}',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#ea580c,#f97316);border-radius:12px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 24px;">
            <div style="font-size:36px;">📅</div>
            <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:8px;">Rent Payment Reminder</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 12px 0;">
      Hi {{name}},
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 16px 0;">
      This is a friendly reminder that your rent payment for <strong>{{propertyTitle}}</strong> is due.
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
        <tr>
          <td style="padding:16px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:14px;color:#64748b;">Property</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">{{propertyTitle}}</td></tr>
              <tr><td style="padding:4px 0;font-size:14px;color:#64748b;">Amount Due</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">{{amount}}</td></tr>
              <tr><td style="padding:4px 0;font-size:14px;color:#64748b;">Due Date</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#ea580c;text-align:right;">{{dueDate}}</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{baseUrl}}/dashboard" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              Make Payment
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'general', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

  -- 12. Landlord – New Application Received
  INSERT INTO email_templates (name, description, subject, content_html, category, is_system, created_by)
  VALUES (
    'Landlord – New Tenant Application',
    'Notifies landlords when a tenant applies to their property.',
    'New Application for {{propertyTitle}}',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0284c7,#0ea5e9);border-radius:12px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 24px;">
            <div style="font-size:36px;">📋</div>
            <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:8px;">New Application Received</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 12px 0;">
      Hello {{name}},
    </td>
  </tr>
  <tr>
    <td style="font-size:15px;line-height:1.7;color:#475569;padding:0 0 16px 0;">
      Great news! <strong>{{tenantName}}</strong> has applied to rent <strong>{{propertyTitle}}</strong>.
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
        <tr>
          <td style="padding:16px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:14px;color:#64748b;">Tenant</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">{{tenantName}}</td></tr>
              <tr><td style="padding:4px 0;font-size:14px;color:#64748b;">Email</td><td style="padding:4px 0;font-size:14px;color:#0f172a;text-align:right;">{{tenantEmail}}</td></tr>
              <tr><td style="padding:4px 0;font-size:14px;color:#64748b;">Phone</td><td style="padding:4px 0;font-size:14px;color:#0f172a;text-align:right;">{{tenantPhone}}</td></tr>
              <tr><td style="padding:4px 0;font-size:14px;color:#64748b;">Applied On</td><td style="padding:4px 0;font-size:14px;color:#0f172a;text-align:right;">{{appliedDate}}</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#0284c7;border-radius:8px;">
            <a href="{{baseUrl}}/dashboard" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              Review Application
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>',
    'general', TRUE, admin_id
  )
  ON CONFLICT DO NOTHING;

END $$;

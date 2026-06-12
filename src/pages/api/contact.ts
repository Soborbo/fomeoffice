export const prerender = false;

import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { getEnv } from '../../lib/db';
import { escapeHtml, safeHeader } from '../../lib/utils/html';

interface ContactData {
  firstName: string;
  lastName: string;
  email: string;
  message: string;
  website?: string; // honeypot
  turnstileToken?: string;
}

function getCustomerEmailHtml(data: ContactData): string {
  const firstName = escapeHtml(data.firstName);
  const message = escapeHtml(data.message);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #19576d; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Foam Office</h1>
      <p style="color: #f5e642; margin: 10px 0 0 0; font-size: 14px;">Southmead, Bristol</p>
    </div>

    <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
      <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">Hi ${firstName},</h2>

      <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0;">
        Thank you for getting in touch! We've received your message and will get back to you as soon as possible.
      </p>

      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <h4 style="color: #19576d; margin: 0 0 10px 0; font-size: 14px;">Your Message</h4>
        <p style="color: #666; margin: 0; font-size: 14px; white-space: pre-wrap;">${message}</p>
      </div>

      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
        <h4 style="color: #333; margin: 0 0 10px 0; font-size: 14px;">Our Location</h4>
        <p style="color: #666; margin: 0; font-size: 14px;">290-294 Southmead Road, Bristol BS10 5EN</p>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">07 977 889747</p>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Mon-Sat 9am-7pm, Sun 9am-5pm</p>
      </div>

      <p style="color: #666; margin: 30px 0 0 0;">
        Speak soon!<br>
        <strong style="color: #19576d;">The Foam Office Team</strong>
      </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
      <p style="margin: 0;">&copy; ${new Date().getFullYear()} Painless Van & Car Valeting Ltd (trading as Foam Office)</p>
      <p style="margin: 5px 0 0 0;">290-294 Southmead Road, Bristol BS10 5EN</p>
    </div>
  </div>
</body>
</html>
  `;
}

function getOfficeEmailHtml(data: ContactData): string {
  const firstName = escapeHtml(data.firstName);
  const lastName = escapeHtml(data.lastName);
  const email = escapeHtml(data.email);
  const message = escapeHtml(data.message);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #19576d; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #f5e642; margin: 0; font-size: 24px;">New Contact Form Message</h1>
    </div>

    <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">

      <h3 style="color: #19576d; margin: 0 0 15px 0; font-size: 16px; border-bottom: 2px solid #e5e5e5; padding-bottom: 10px;">
        Customer Details
      </h3>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee; width: 30%;">Name</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; border-bottom: 1px solid #eee;">${firstName} ${lastName}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Email</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; border-bottom: 1px solid #eee;">
            <a href="mailto:${email}" style="color: #19576d;">${email}</a>
          </td>
        </tr>
      </table>

      <h3 style="color: #19576d; margin: 30px 0 15px 0; font-size: 16px; border-bottom: 2px solid #e5e5e5; padding-bottom: 10px;">
        Message
      </h3>

      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 0 0 25px 0;">
        <p style="color: #333; margin: 0; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      </div>

      <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
        <a href="mailto:${email}?subject=Re: Your message to Foam Office" style="display: inline-block; background-color: #19576d; color: #ffffff; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-weight: 600;">
          Reply to Customer
        </a>
      </div>

      <p style="color: #999; margin: 30px 0 0 0; font-size: 12px; text-align: center;">
        Sent at ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const cfEnv = getEnv();
    const apiKey = cfEnv.RESEND_API_KEY;

    if (!apiKey) {
      console.error('[contact] RESEND_API_KEY missing from environment');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const resend = new Resend(apiKey);

    const data: ContactData = await request.json();

    // Honeypot check — if filled, silently return success (don't tip off bots)
    if (data.website) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate required fields
    if (!data.firstName || !data.lastName || !data.email || !data.message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify Cloudflare Turnstile token
    const turnstileSecret = cfEnv.TURNSTILE_SECRET_KEY;
    if (turnstileSecret && data.turnstileToken) {
      const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: turnstileSecret,
          response: data.turnstileToken,
        }),
      });

      const turnstileResult = await turnstileResponse.json() as { success: boolean };
      if (!turnstileResult.success) {
        return new Response(JSON.stringify({ error: 'Security verification failed. Please try again.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else if (turnstileSecret && !data.turnstileToken) {
      // Secret is configured but no token provided
      return new Response(JSON.stringify({ error: 'Security verification required.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send email to office
    const officeEmail = await resend.emails.send({
      from: 'Website Contact <contact@foamoffice.co.uk>',
      to: 'office@foamoffice.co.uk',
      replyTo: data.email,
      subject: safeHeader(`Contact Form: ${data.firstName} ${data.lastName}`),
      html: getOfficeEmailHtml(data)
    });

    if (officeEmail.error) {
      console.error('[contact] Office email failed:', JSON.stringify(officeEmail.error));
      return new Response(JSON.stringify({ error: 'Failed to send message' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send confirmation email to customer
    const customerEmail = await resend.emails.send({
      from: 'Foam Office <contact@foamoffice.co.uk>',
      to: data.email,
      subject: 'We received your message - Foam Office',
      html: getCustomerEmailHtml(data)
    });

    if (customerEmail.error) {
      console.error('[contact] Customer email failed:', JSON.stringify(customerEmail.error));
      // Don't fail — office already got the message
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Contact form error:', error);
    return new Response(JSON.stringify({ error: 'Failed to send message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

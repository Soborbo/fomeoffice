export const prerender = false;

import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { z } from 'zod';
import { appendToSheet } from '../../lib/google-sheets';
import { normalizePhone } from '../../utils/phone';
import { getDb, getEnv } from '../../lib/db';
import {
  findOrCreateCustomerByEmail,
  insertBooking,
  priceStringToPence,
  setBookingSheetRow,
} from '../../lib/db/bookings';
import { bookingLog } from '../../lib/audit/log';
import { escapeHtml, safeHeader } from '../../lib/utils/html';

const VEHICLE_TYPES = ['car', 'suv', 'van', 'caravan', 'motorhome', 'supercar'] as const;

const BookingSchema = z.object({
  vehicle: z.enum(VEHICLE_TYPES),
  vehicleLabel: z.string().min(1).max(80),
  service: z.string().min(1).max(80),
  serviceLabel: z.string().min(1).max(120),
  price: z.string().max(40).optional().default(''),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  name: z.string().max(160).optional().default(''),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')).default(''),
  gclid: z.string().max(200).optional().default(''),
  fbclid: z.string().max(200).optional().default(''),
  utmSource: z.string().max(120).optional().default(''),
  utmMedium: z.string().max(120).optional().default(''),
  utmCampaign: z.string().max(120).optional().default(''),
  utmTerm: z.string().max(120).optional().default(''),
  utmContent: z.string().max(120).optional().default(''),
});

type BookingData = z.infer<typeof BookingSchema>;

function formatDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTime(time: string): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${display}:${m}${suffix}`;
}

function getCustomerEmailHtml(data: BookingData): string {
  const fullName = data.name || `${data.firstName} ${data.lastName}`.trim();
  const greetingName = escapeHtml(data.firstName || fullName);
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
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Painless Car & Van Wash</h1>
      <p style="color: #f5e642; margin: 10px 0 0 0; font-size: 14px;">Southmead, Bristol</p>
    </div>

    <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">
      <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">Hi ${greetingName},</h2>

      <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0;">
        Thank you for your booking! Your appointment is confirmed. We look forward to seeing you.
      </p>

      <div style="background-color: #d1fae5; border: 2px solid #059669; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <p style="color: #065f46; margin: 0; font-weight: bold; font-size: 16px;">
          Your appointment is confirmed
        </p>
        <p style="color: #065f46; margin: 10px 0 0 0; font-size: 14px;">
          Just turn up at the time below and we'll take care of the rest. If you need to change anything, call us on 07 977 889747.
        </p>
      </div>

      <h3 style="color: #19576d; margin: 30px 0 15px 0; font-size: 16px; border-bottom: 2px solid #e5e5e5; padding-bottom: 10px;">
        Your Booking Details
      </h3>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Vehicle Type</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; text-align: right; border-bottom: 1px solid #eee;">${escapeHtml(data.vehicleLabel)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Service</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; text-align: right; border-bottom: 1px solid #eee;">${escapeHtml(data.serviceLabel)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Estimated Price</td>
          <td style="padding: 12px 0; color: #19576d; font-weight: 700; text-align: right; border-bottom: 1px solid #eee; font-size: 18px;">${escapeHtml(data.price)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Preferred Date</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; text-align: right; border-bottom: 1px solid #eee;">${escapeHtml(formatDate(data.date))}</td>
        </tr>
        ${data.time ? `<tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Preferred Time</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; text-align: right; border-bottom: 1px solid #eee;">${escapeHtml(formatTime(data.time))}</td>
        </tr>` : ''}
      </table>

      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
        <h4 style="color: #333; margin: 0 0 10px 0; font-size: 14px;">Our Location</h4>
        <p style="color: #666; margin: 0; font-size: 14px;">290-294 Southmead Road, Bristol BS10 5EN</p>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">07 977 889747</p>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Mon-Sat 9am-7pm, Sun 9am-5pm</p>
      </div>

      <p style="color: #666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
        If you have any questions or need to modify your request, please don't hesitate to call us.
      </p>

      <p style="color: #666; margin: 30px 0 0 0;">
        See you soon!<br>
        <strong style="color: #19576d;">The Painless Car & Van Wash Team</strong>
      </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
      <p style="margin: 0;">© ${new Date().getFullYear()} Painless Van & Car Valeting Ltd</p>
      <p style="margin: 5px 0 0 0;">290-294 Southmead Road, Bristol BS10 5EN</p>
    </div>
  </div>
</body>
</html>
  `;
}

function getOfficeEmailHtml(data: BookingData): string {
  const fullName = data.name || `${data.firstName} ${data.lastName}`.trim();
  const safeFullName = escapeHtml(fullName);
  const safeEmail = escapeHtml(data.email);
  const safePhone = escapeHtml(data.phone);
  const safeVehicle = escapeHtml(data.vehicleLabel);
  const safeService = escapeHtml(data.serviceLabel);
  const safePrice = escapeHtml(data.price);
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
      <h1 style="color: #f5e642; margin: 0; font-size: 24px;">New Booking Request</h1>
    </div>

    <div style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px;">

      <div style="background-color: #d1fae5; border-left: 4px solid #059669; padding: 15px 20px; margin: 0 0 25px 0;">
        <p style="color: #065f46; margin: 0; font-weight: bold;">New Confirmed Booking</p>
        <p style="color: #065f46; margin: 5px 0 0 0; font-size: 14px;">This booking has been automatically confirmed. The customer will arrive at the time shown below.</p>
      </div>

      <h3 style="color: #19576d; margin: 0 0 15px 0; font-size: 16px; border-bottom: 2px solid #e5e5e5; padding-bottom: 10px;">
        Customer Details
      </h3>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee; width: 40%;">Name</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; border-bottom: 1px solid #eee;">${safeFullName}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Email</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; border-bottom: 1px solid #eee;">
            <a href="mailto:${safeEmail}" style="color: #19576d;">${safeEmail}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Phone</td>
          <td style="padding: 12px 0; color: #333; font-weight: 700; border-bottom: 1px solid #eee; font-size: 18px;">
            <a href="tel:${safePhone}" style="color: #19576d;">${safePhone}</a>
          </td>
        </tr>
      </table>

      <h3 style="color: #19576d; margin: 30px 0 15px 0; font-size: 16px; border-bottom: 2px solid #e5e5e5; padding-bottom: 10px;">
        Booking Details
      </h3>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee; width: 40%;">Vehicle Type</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; border-bottom: 1px solid #eee;">${safeVehicle}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Service</td>
          <td style="padding: 12px 0; color: #333; font-weight: 600; border-bottom: 1px solid #eee;">${safeService}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #666; border-bottom: 1px solid #eee;">Estimated Price</td>
          <td style="padding: 12px 0; color: #19576d; font-weight: 700; border-bottom: 1px solid #eee; font-size: 18px;">${safePrice}</td>
        </tr>
        <tr style="background-color: #f0fdf4;">
          <td style="padding: 12px; color: #166534; font-weight: 600;">Preferred Date</td>
          <td style="padding: 12px; color: #166534; font-weight: 700; font-size: 16px;">${escapeHtml(formatDate(data.date))}</td>
        </tr>
        ${data.time ? `<tr style="background-color: #f0fdf4;">
          <td style="padding: 12px; color: #166534; font-weight: 600;">Preferred Time</td>
          <td style="padding: 12px; color: #166534; font-weight: 700; font-size: 16px;">${escapeHtml(formatTime(data.time))}</td>
        </tr>` : ''}
      </table>

      <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
        <a href="tel:${safePhone}" style="display: inline-block; background-color: #19576d; color: #ffffff; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-weight: 600;">
          Call Customer Now
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

export const POST: APIRoute = async (context) => {
  const { request } = context;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = BookingSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid required fields' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Reject dates in the past (UK timezone, the ops timezone). The booking
  // form already prevents this client-side, but a direct POST shouldn't be
  // able to create yesterday's booking.
  const todayUk = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (parsed.data.date < todayUk) {
    return new Response(JSON.stringify({ error: 'Date is in the past' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = parsed.data;
  data.phone = normalizePhone(data.phone);
  if (!data.name) data.name = `${data.firstName} ${data.lastName}`.trim();

  const env = getEnv();

  // ----- D1 INSERT (must succeed; D1 is the source of truth) ------------
  let bookingId: number;
  try {
    const db = getDb();
    const customerId = await findOrCreateCustomerByEmail(db, data.email, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
    });

    bookingId = await insertBooking(db, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || null,
      vehicleType: data.vehicle,
      vehicleLabel: data.vehicleLabel,
      serviceCode: data.service,
      serviceLabel: data.serviceLabel,
      pricePence: priceStringToPence(data.price),
      date: data.date,
      time: data.time || null,
      source: 'website',
      customerId,
      gclid: data.gclid || null,
      fbclid: data.fbclid || null,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,
      utmTerm: data.utmTerm || null,
      utmContent: data.utmContent || null,
    });

    await bookingLog(db, {
      bookingId,
      action: 'booking_created',
      actorType: 'website',
      after: {
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        service: data.serviceLabel,
        date: data.date,
        time: data.time,
      },
      request,
    });
  } catch (err) {
    console.error('[booking] D1 insert failed:', err);
    return new Response(JSON.stringify({ error: 'Could not save booking' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.RESEND_API_KEY) {
    console.error('[booking] RESEND_API_KEY missing — booking saved but emails skipped');
  }

  const sheetsEnv = {
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_PRIVATE_KEY,
    spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
  };

  // ----- Email + Sheets (best-effort) -------------------------------------
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  // safeHeader strips CR/LF so a user-controlled name can't smuggle a header.
  const customerSubject = safeHeader(`Booking Confirmed - ${data.serviceLabel}`);
  const officeSubject = safeHeader(
    `New Booking: ${data.name} - ${data.serviceLabel} - ${formatDate(data.date)}${data.time ? ` at ${formatTime(data.time)}` : ''}`,
  );

  const customerEmailPromise = resend
    ? resend.emails.send({
        from: 'Painless Car & Van Wash <bookings@bristolcarwash.co.uk>',
        to: data.email,
        subject: customerSubject,
        html: getCustomerEmailHtml(data),
      })
    : Promise.resolve(null);

  const officeEmailPromise = resend
    ? resend.emails.send({
        from: 'Website Bookings <bookings@bristolcarwash.co.uk>',
        to: 'office@bristolcarwash.co.uk',
        subject: officeSubject,
        html: getOfficeEmailHtml(data),
      })
    : Promise.resolve(null);

  const sheetPromise = appendToSheet(
    [
      [
        new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }),
        data.firstName || '',
        data.lastName || '',
        data.vehicleLabel,
        data.serviceLabel,
        data.price,
        data.phone,
        data.email,
        formatDate(data.date),
        data.time ? formatTime(data.time) : '',
        data.gclid || '',
        data.fbclid || '',
        data.utmSource || '',
        data.utmMedium || '',
        data.utmCampaign || '',
        data.utmTerm || '',
        data.utmContent || '',
      ],
    ],
    sheetsEnv,
  );

  const [customerEmailRes, officeEmailRes, sheetRes] = await Promise.all([
    customerEmailPromise,
    officeEmailPromise,
    sheetPromise,
  ]);

  if (customerEmailRes && 'error' in customerEmailRes && customerEmailRes.error) {
    console.error('[booking] Customer email failed:', JSON.stringify(customerEmailRes.error));
  }
  if (officeEmailRes && 'error' in officeEmailRes && officeEmailRes.error) {
    console.error('[booking] Office email failed:', JSON.stringify(officeEmailRes.error));
  }

  if (sheetRes.ok && sheetRes.row != null) {
    try {
      await setBookingSheetRow(getDb(), bookingId, sheetRes.row);
    } catch (err) {
      console.error('[booking] Failed to record sheet_row:', err);
    }
  } else {
    console.warn('[booking] Sheets append did not return a row; D1 record stays without sheet_row');
  }

  return new Response(
    JSON.stringify({
      success: true,
      bookingId,
      customerEmailId:
        customerEmailRes && 'data' in customerEmailRes ? customerEmailRes.data?.id : null,
      officeEmailId:
        officeEmailRes && 'data' in officeEmailRes ? officeEmailRes.data?.id : null,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

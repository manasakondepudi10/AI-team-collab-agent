import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

function hasSmtpConfig() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export async function sendVerificationEmail(input: { to: string; name: string; code: string }) {
  if (!hasSmtpConfig()) {
    console.log(`[dev-email] Verification code for ${input.to}: ${input.code}`);
    return { delivered: false, mode: 'console' as const };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: input.to,
    subject: 'Verify your AI Team Collab Agent signup',
    text: `Hi ${input.name},\n\nYour verification code is ${input.code}. It expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes.\n\nAfter email verification, you will connect GitHub to finish registration.`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#18202f;line-height:1.5">
        <h2>Verify your AI Team Collab Agent signup</h2>
        <p>Hi ${input.name},</p>
        <p>Use this code to verify your email before connecting GitHub:</p>
        <p style="font-size:28px;font-weight:800;letter-spacing:4px">${input.code}</p>
        <p>This code expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes.</p>
      </div>
    `
  });

  return { delivered: true, mode: 'smtp' as const };
}

import nodemailer from "nodemailer";

// Talking to Postfix on the same machine over loopback — no need for TLS on
// this hop, and the default Postfix install has no working cert for it, so
// nodemailer's opportunistic STARTTLS attempt fails the handshake. Skip it.
const transporter = nodemailer.createTransport({ host: "localhost", port: 25, secure: false, ignoreTLS: true });

function verificationEmailHtml(code: string): string {
  return `
<body style="margin:0;padding:32px 16px;background-color:#f4f1ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:420px;background-color:#ffffff;border-radius:16px;overflow:hidden;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background-color:#e8536b;padding:28px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;">El Super Mama</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px;text-align:center;">
              <p style="margin:0 0 4px;color:#1a1a1a;font-size:17px;font-weight:600;">Verify your email</p>
              <p style="margin:0;color:#6b6b6b;font-size:14px;line-height:1.5;">Enter this code to finish setting up your account.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;text-align:center;">
              <span style="display:inline-block;padding:14px 28px;background-color:#f4f1ee;border-radius:12px;color:#1a1a1a;font-size:32px;font-weight:700;letter-spacing:8px;">${code}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <p style="margin:0;color:#9a9a9a;font-size:13px;line-height:1.5;">This code expires in 10 minutes.<br/>If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>`;
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: '"El Super Mama" <otp@elsupermama.info>',
    to,
    subject: "Your El Super Mama verification code",
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
    html: verificationEmailHtml(code),
  });
}

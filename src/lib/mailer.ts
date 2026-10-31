import nodemailer from "nodemailer";

// Talking to Postfix on the same machine over loopback — no need for TLS on
// this hop, and the default Postfix install has no working cert for it, so
// nodemailer's opportunistic STARTTLS attempt fails the handshake. Skip it.
const transporter = nodemailer.createTransport({ host: "localhost", port: 25, secure: false, ignoreTLS: true });

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: "otp@elsupermama.info",
    to,
    subject: "Your El Super Mama verification code",
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
}

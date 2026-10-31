import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({ host: "localhost", port: 25 });

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: "otp@elsupermama.info",
    to,
    subject: "Your El Super Mama verification code",
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
}

/*
 * Simple mail sending test using existing emailService.
 * Usage:
 *   node scripts/send_test_email.js you@example.com
 * or set EMAIL_TEST_TO in .env and run without args.
 */

require('dotenv').config();

const emailService = require('../services/emailService');

async function main() {
  try {
    const recipientArg = process.argv[2];
    const recipient = recipientArg || process.env.EMAIL_TEST_TO;

    if (!recipient) {
      console.error('Please provide a recipient email as an argument or set EMAIL_TEST_TO in .env');
      process.exit(1);
    }

    const otp = emailService.generateOTP();
    console.log(`Attempting to send test OTP to ${recipient} ...`);

    const ok = await emailService.sendOTP(recipient, otp);
    if (ok) {
      console.log('Success: Test email/OTP send reported OK.');
      console.log(`If email is mocked, check server logs for OTP. OTP: ${otp}`);
      process.exit(0);
    } else {
      console.error('Failure: emailService.sendOTP returned false.');
      process.exit(2);
    }
  } catch (err) {
    console.error('Unexpected error while sending test email:', err);
    process.exit(3);
  }
}

main();



const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID; 
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_NUMBER;

const client = new twilio(accountSid, authToken);

/**
 * @param {string} to
 * @param {string} messageBody
 */

const cleanAndFormatNumber = (phoneNumber) => {
  if (!phoneNumber) return null;
  const firstPhone = phoneNumber.split(/[;,]/)[0];
  let digits = firstPhone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  else if (digits.length > 10) {
    return `+${digits}`;
  }
  return null;
};

const sendSMS = async (to, messageBody) => {
  try {
    const formattedNumber = cleanAndFormatNumber(to);
    if (!formattedNumber) {
      throw new Error(`Format de numéro invalide : ${to}`);
    }
    const response = await client.messages.create({
      body: messageBody,
      from: twilioNumber,
      to: formattedNumber
    });
    console.log('SMS envoyé avec succès:', response.sid);
    return { success: true, sid: response.sid };
  } catch (error) {
    console.error('Erreur Service SMS:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendSMS };
const nodeMailer = require("nodemailer");

const smtpTrans = nodeMailer.createTransport({
  host: "smtp.office365.com",
  secure: false,
  port: 587,
  auth: {
    user: "notifications@constructiongalaxyhub.com",
    pass: "108Nodes!",
  },
});

module.exports = {
  smtpTrans,
};

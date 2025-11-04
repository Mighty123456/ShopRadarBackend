const { OAuth2Client } = require('google-auth-library');

const parseClientIds = () => {
  const raw = process.env.GOOGLE_OAUTH_CLIENT_IDS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

const allowedClientIds = parseClientIds();
const oauthClient = new OAuth2Client();

async function verifyGoogleIdToken(idToken) {
  const options = { idToken };
  if (allowedClientIds.length > 0) {
    options.audience = allowedClientIds;
  }
  const ticket = await oauthClient.verifyIdToken(options);
  return ticket.getPayload();
}

module.exports = { verifyGoogleIdToken, allowedClientIds };



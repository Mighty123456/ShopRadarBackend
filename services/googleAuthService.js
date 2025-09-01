const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userModel');
const authService = require('./authService');

// Configure Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('Google profile:', profile);
    
    // Check if user already exists
    let user = await User.findOne({ googleId: profile.id });
    
    if (!user) {
      // Check if user exists with same email
      user = await User.findOne({ email: profile.emails[0].value });
      
      if (user) {
        // Update existing user with Google ID
        user.googleId = profile.id;
        user.name = profile.displayName;
        user.picture = profile.photos[0]?.value;
        user.isEmailVerified = true; // Google emails are verified
        await user.save();
      } else {
        // Create new user
        user = new User({
          email: profile.emails[0].value,
          googleId: profile.id,
          name: profile.displayName,
          picture: profile.photos[0]?.value,
          isEmailVerified: true, // Google emails are verified
        });
        await user.save();
      }
    }
    
    return done(null, user);
  } catch (error) {
    console.error('Google auth error:', error);
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Verify Google ID Token (for mobile apps)
const verifyGoogleIdToken = async (idToken) => {
  try {
    // In production, you should verify the token with Google's servers
    // For now, we'll use a simplified approach
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    return payload;
  } catch (error) {
    console.error('Google ID token verification error:', error);
    throw error;
  }
};

module.exports = {
  passport,
  verifyGoogleIdToken
}; 
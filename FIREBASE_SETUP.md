# 🔐 Firebase Cloud Messaging Setup

## 📍 Where to Get Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Go to **⚙️ Project Settings** → **Service Accounts** tab
4. Click **"Generate New Private Key"**
5. Download the JSON file

## 📝 Where to Put Credentials

### **Location:** `backend_node/.env` file

Add this line to your `.env` file:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",...}
```

**Important:**
- Convert the entire JSON to a **single line**
- Escape quotes properly
- Keep it on one line

## ✅ Verification

1. Install dependency: `npm install firebase-admin`
2. Restart server: `npm run dev`
3. Check logs for: `✅ Firebase Admin SDK initialized successfully`

## 🔒 Security

- ✅ `.env` file is in `.gitignore` (secure)
- ❌ **NEVER** commit `.env` to Git
- ❌ **NEVER** share your service account key
- ✅ Keep credentials private

---

**For detailed instructions, see `FIREBASE_CREDENTIALS_SETUP.md`**


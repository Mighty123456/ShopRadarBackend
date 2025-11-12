# 🔒 Fix Git Push - Remove Credentials from History

## ⚠️ Problem
GitHub is blocking your push because credentials are still in commit `7392c8770d9d0c6899f6f4418f5a25eecbba53bd`.

## ✅ Solution: Remove File from Git History

Run these commands in PowerShell from the `backend_node` directory:

### **Step 1: Navigate to backend_node**
```powershell
cd "D:\Program Files\ShopRadar\backend_node"
```

### **Step 2: Remove the file from git**
```powershell
git rm ADD_FIREBASE_CREDENTIALS.md
```

### **Step 3: Commit the removal**
```powershell
git commit -m "Remove file containing Firebase credentials"
```

### **Step 4: Force push (rewrites history)**
```powershell
git push --force-with-lease
```

---

## 🔄 Alternative: Interactive Rebase (More Thorough)

If the above doesn't work, remove the commit entirely:

### **Step 1: Start interactive rebase**
```powershell
git rebase -i HEAD~3
```

### **Step 2: In the editor, change the commit with credentials from `pick` to `drop`**
```
drop 7392c87 Your commit message
pick abc1234 Next commit
pick def5678 Last commit
```

### **Step 3: Save and close**

### **Step 4: Force push**
```powershell
git push --force-with-lease
```

---

## 🚨 CRITICAL: Rotate Your Firebase Credentials

**Since the credentials were exposed in git history, you MUST:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. **Project Settings** → **Service Accounts**
3. **Delete the old service account key** (the one that was exposed)
4. **Generate a new private key**
5. Update your `.env` file with the **new** credentials

**The old credentials are compromised and should not be used!**

---

## ✅ After Fixing

Once you've:
- ✅ Removed the file from git
- ✅ Rotated your Firebase credentials
- ✅ Updated `.env` with new credentials

Your push should work and the notification system will be ready!

---

**Note:** The file `ADD_FIREBASE_CREDENTIALS.md` has been deleted. Use `FIREBASE_SETUP.md` or `FIREBASE_CREDENTIALS_SETUP.md` for instructions instead.


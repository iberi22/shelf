# Firebase Configuration Guide - Free Tier

## 🔥 Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: `shelf-inventory`
4. Disable Google Analytics (optional for free tier)
5. Click "Create project"

## 🔐 Step 2: Setup Authentication

1. In Firebase Console, go to **Authentication** > **Get started**
2. Enable **Email/Password** sign-in method
3. Click on "Email/Password" and enable it
4. Save

### Free Tier Limits:
- ✅ Unlimited authentication users
- ✅ 10,000 verifications/month for phone auth (if needed)

## 📦 Step 3: Setup Firestore Database

1. Go to **Firestore Database** > **Create database**
2. Choose **Start in production mode** (we'll configure rules later)
3. Choose your region (closest to your users)
4. Click "Enable"

### Update Firestore Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Public read for metadata (if needed)
    match /metadata/{document=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

### Free Tier Limits:
- ✅ 1 GiB storage
- ✅ 50,000 reads/day
- ✅ 20,000 writes/day
- ✅ 20,000 deletes/day

## 💾 Step 4: Setup Storage (Optional)

1. Go to **Storage** > **Get started**
2. Start in production mode
3. Choose same region as Firestore

### Update Storage Rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Free Tier Limits:
- ✅ 5 GB storage
- ✅ 1 GB/day downloads
- ✅ 20,000 uploads/day

## 🔑 Step 5: Get Configuration

1. Go to **Project Settings** (gear icon)
2. Scroll down to "Your apps"
3. Click the Web icon (`</>`)
4. Register app with nickname: "shelf-web"
5. Copy the firebaseConfig object

## 📝 Step 6: Configure Environment Variables

Create or update `.env.local`:

```env
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

## 🚀 Step 7: Update firebase.ts

The `firebase.ts` file will automatically use environment variables when deployed to Vercel.

## 📊 Monitoring Usage

Track your usage in Firebase Console:
- **Authentication** > **Usage** tab
- **Firestore** > **Usage** tab
- **Storage** > **Usage** tab

### Tips to Stay Within Free Tier:

1. **Optimize Queries**: Use indexes and limit results
2. **Cache Data**: Use local storage to reduce reads
3. **Batch Operations**: Group writes when possible
4. **Use Offline Persistence**: Firestore supports offline mode
5. **Implement Pagination**: Don't load all data at once

## 🔒 Security Best Practices

1. ✅ Never commit `.env.local` to git
2. ✅ Use Firebase Security Rules
3. ✅ Validate data on client and server
4. ✅ Set up Firebase App Check (optional)
5. ✅ Enable multi-factor authentication for sensitive apps

## 📱 Add to Vercel

In your Vercel project dashboard:

1. Go to **Settings** > **Environment Variables**
2. Add all VITE_FIREBASE_* variables
3. Set for: Production, Preview, Development
4. Redeploy

## 🎯 Testing

1. Start local dev: `npm run dev`
2. Try signing up with email/password
3. Check Firestore for user data
4. Verify authentication works

---

**Your Firebase project is now configured for FREE tier! 🎉**

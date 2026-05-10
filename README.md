# Road Trip Map Builder

Build your road trip. Share the adventure.

## Local dev

```bash
npm install
cp .env.example .env   # then fill in values
npm run dev
```

The server starts at http://localhost:8080.

- App: http://localhost:8080
- Health: http://localhost:8080/health
- Client config: http://localhost:8080/config
- Current user (needs Firebase ID token): `curl -H "Authorization: Bearer <token>" http://localhost:8080/api/me`

### Local Firebase Admin credentials

Download a service account key from Firebase Console → Project Settings → Service Accounts → Generate new private key, save it outside the repo, and point `GOOGLE_APPLICATION_CREDENTIALS` at that file. On Cloud Run, leave that var unset — Application Default Credentials are picked up from the runtime service account.

### Access allowlist

`ALLOWED_EMAILS` is a comma-separated list. When set, only those emails can pass `/api/me` and any other authenticated endpoint. Leave blank to open the site to any Google account (post-launch mode). In private beta, set it to your own email.

```
gcloud run services update road-trip --region=europe-north1 \                                     
    --update-env-vars ALLOWED_EMAILS=emanuel.palacio@gmail.com,FRIEND_EMAIL@example.com 
```


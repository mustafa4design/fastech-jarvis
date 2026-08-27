# Dashboard Deploy Guide — Netlify Free Tier
*Deploy the JARVIS dashboard so both Mustafa and Hafsa can access it via one shared link.*

---

## ✅ DEPLOYED

**Live URL:** https://fastech-jarvis-social.netlify.app/
Share this link with Hafsa. That's it.

---

## WHAT'S DEPLOYED

File: `dashboard/JARVIS AI HQ.html`
Site name: `fastech-jarvis-social`
URL: `https://fastech-jarvis-social.netlify.app/`

---

## OPTION A — DRAG AND DROP (fastest, 2 minutes)

1. Go to netlify.com → sign up or log in with your Gmail
2. Go to your Netlify dashboard → "Sites"
3. At the bottom of the page, you'll see a drop zone: **"Want to deploy a new site without connecting to Git? Drag and drop your site output folder here."**
4. Drag the entire `dashboard/` folder from your file explorer into that drop zone
5. Netlify deploys in ~10 seconds
6. You'll get a random URL like `https://random-name-123.netlify.app`
7. Click "Site settings" → "Change site name" → rename to `jarvis-fastech` or similar
8. Your URL is now: `https://jarvis-fastech.netlify.app`
9. Share that link with Hafsa

---

## OPTION B — NETLIFY CLI (better for updates)

### Install Netlify CLI:
```bash
npm install -g netlify-cli
```

### Login:
```bash
netlify login
```

### Deploy:
```bash
cd "E:/Claude Space/fastech-jarvis/dashboard"
netlify deploy --prod --dir . --site-name jarvis-fastech
```

### Update dashboard later (just re-run):
```bash
netlify deploy --prod --dir "E:/Claude Space/fastech-jarvis/dashboard" --site-name jarvis-fastech
```

---

## OPTION C — GITHUB + NETLIFY (best for automatic updates)

1. Create a new GitHub repo named `jarvis-dashboard` (private)
2. Push the `dashboard/` folder to it
3. In Netlify: "New site from Git" → connect GitHub → select the repo
4. Build settings: leave blank (it's a static HTML file)
5. Deploy → get your URL

**Benefit:** Every time you push changes to GitHub, Netlify auto-redeploys.

---

## SHARING WITH HAFSA

1. Send Hafsa the URL (e.g., `https://jarvis-fastech.netlify.app`)
2. The dashboard is publicly accessible via the link — no login required
3. If you want password protection: Netlify Pro (paid) → or use a service like Cloudflare Access (free) to add a password

---

## ADDING ENVIRONMENT VARIABLES (if dashboard needs API keys later)

In Netlify dashboard:
- Site settings → Environment variables → Add variable
- This is where you'd add Buffer API keys or Slack webhook URLs if the dashboard becomes dynamic

---

## RECOMMENDED DOMAIN (optional)

If you want a custom domain like `dashboard.fastechpak.com`:
1. Buy the domain on Namecheap or Google Domains
2. In Netlify: Site settings → Domain management → Add custom domain
3. Follow Netlify's DNS instructions (takes ~24 hours to propagate)

---

## QUICK REFERENCE

| Step | What to do |
|---|---|
| Deploy | Drag dashboard/ folder to netlify.com drop zone |
| URL | Rename to jarvis-fastech.netlify.app |
| Share | Send link to Hafsa |
| Update | Re-drag or use CLI deploy command |
| Custom domain | Optional — set up in Netlify domain settings |

# Static Sites

This directory contains static landing pages and websites that are deployed independently on Render.

## Directory Structure

```
sites/
├── example-landing/     # Example template (copy for new sites)
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── main.js
│   └── images/
├── your-business-1/     # Your first site
├── your-business-2/     # Your second site
└── README.md
```

## Quick Start: Adding a New Site

### Step 1: Create Site Folder

```bash
# Copy the example template
cp -r sites/example-landing sites/your-new-site

# Or create from scratch
mkdir -p sites/your-new-site/{css,js,images}
```

### Step 2: Customize Your Site

Edit the files in your new site folder:
- `index.html` - Main page content
- `css/style.css` - Styles
- `js/main.js` - JavaScript
- `images/` - Add your images, favicon, og-image, etc.

### Step 3: Add to render.yaml

Add this block to the root `render.yaml` file:

```yaml
  - type: web
    name: your-new-site
    runtime: static
    rootDir: sites/your-new-site
    staticPublishPath: .
    headers:
      - path: /*
        name: Cache-Control
        value: public, max-age=3600
      - path: /css/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
      - path: /js/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
      - path: /images/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
```

### Step 4: Deploy

```bash
git add .
git commit -m "Add new site: your-new-site"
git push
```

Then go to Render Dashboard → Blueprint → **Sync** to create the new service.

---

## Domain Setup: Complete Walkthrough

### Option A: Cloudflare (Recommended)

Cloudflare offers domains at cost (no markup) plus free CDN/SSL.

#### 1. Create Cloudflare Account

1. Go to [cloudflare.com](https://cloudflare.com)
2. Click **Sign Up** → Create account with email
3. Verify your email

#### 2. Purchase Domain

1. In Cloudflare Dashboard, click **Domain Registration** (left sidebar)
2. Click **Register Domains**
3. Search for your desired domain name
4. Select a domain and click **Purchase**
5. Enter payment info and complete purchase
6. Domain is now registered AND DNS is already on Cloudflare ✓

#### 3. Add DNS Record (CNAME)

1. Go to **DNS** → **Records** (left sidebar)
2. Click **Add Record**
3. Configure:
   - **Type**: `CNAME`
   - **Name**: `@` (or `www` for www.yourdomain.com)
   - **Target**: `your-site-name.onrender.com` (your Render site URL)
   - **Proxy status**: Toggle ON (orange cloud) for CDN benefits
4. Click **Save**

For apex domain (yourdomain.com without www):
- Cloudflare automatically handles CNAME flattening for apex domains

For both www and non-www:
```
Type: CNAME | Name: @   | Target: your-site.onrender.com
Type: CNAME | Name: www | Target: your-site.onrender.com
```

#### 4. Connect Domain in Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click on your static site
3. Go to **Settings** → **Custom Domains**
4. Click **Add Custom Domain**
5. Enter: `yourdomain.com`
6. Click **Save**
7. If using www too, add that separately: `www.yourdomain.com`

#### 5. Wait for SSL (Automatic)

- Render automatically provisions SSL via Let's Encrypt
- Takes 5-15 minutes after DNS propagates
- You'll see a green checkmark when ready

#### 6. Verify

Visit your domain in a browser. You should see:
- ✅ Your site loads
- ✅ HTTPS works (padlock icon)
- ✅ No security warnings

---

### Option B: Other Registrars (Namecheap, Porkbun, etc.)

If you prefer another registrar:

#### 1. Purchase Domain

Buy domain from your preferred registrar (Namecheap, Porkbun, Google Domains, etc.)

#### 2. Point DNS to Render

**Option 2a: Use Render's recommended setup**

In your registrar's DNS settings, add:

For apex domain (`yourdomain.com`):
```
Type: A     | Host: @   | Value: 216.24.57.1
Type: A     | Host: @   | Value: 216.24.57.2
```

For www subdomain:
```
Type: CNAME | Host: www | Value: your-site-name.onrender.com
```

**Option 2b: Use Cloudflare DNS (without buying domain there)**

1. Create free Cloudflare account
2. Add your domain to Cloudflare (select Free plan)
3. Cloudflare will give you nameservers (e.g., `ada.ns.cloudflare.com`)
4. Go to your registrar and change nameservers to Cloudflare's
5. Wait 24-48 hours for propagation
6. Now manage DNS in Cloudflare (follow steps in Option A above)

#### 3. Add Domain in Render

Same as Step 4 in Option A.

---

## Troubleshooting

### SSL Certificate Not Provisioning

- Wait at least 15-30 minutes
- Verify DNS records are correct: `dig yourdomain.com`
- Check Render dashboard for specific errors
- Ensure Cloudflare proxy is enabled (orange cloud)

### Site Not Loading

- Check Render deploy logs for errors
- Verify `rootDir` in render.yaml matches your folder name
- Ensure `staticPublishPath` is set to `.`

### DNS Not Propagating

- Use [whatsmydns.net](https://whatsmydns.net) to check global propagation
- DNS can take up to 48 hours (usually much faster)
- Try clearing browser cache or using incognito mode

### Mixed Content Warnings

- Ensure all resources (images, scripts, stylesheets) use `https://` or relative paths
- Check browser console for specific URLs causing issues

---

## Best Practices

### Performance

1. **Optimize images**: Use WebP format, compress with tools like [squoosh.app](https://squoosh.app)
2. **Minify CSS/JS**: Use build tools if needed, or online minifiers
3. **Enable caching**: Already configured in render.yaml headers

### SEO

1. **Meta tags**: Fill in all meta tags in `<head>`
2. **Open Graph**: Add og:image for social sharing
3. **Sitemap**: Add sitemap.xml for larger sites
4. **robots.txt**: Add if you need to control crawling

### Security

1. **HTTPS**: Automatic with Render + Cloudflare
2. **CSP Headers**: Add Content-Security-Policy if needed
3. **No secrets**: Never put API keys in static files

---

## Contact Form Options

The template includes a basic contact form. For actual functionality, consider:

1. **Formspree** (free tier): Change form action to `https://formspree.io/f/your-form-id`
2. **Netlify Forms**: Works with Render too via their API
3. **Google Forms**: Embed or link to a Google Form
4. **EmailJS**: Send emails directly from JavaScript

Example with Formspree:
```html
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
    <input type="email" name="email" required>
    <textarea name="message" required></textarea>
    <button type="submit">Send</button>
</form>
```

---

## Adding Analytics

### Google Analytics 4

Add before `</head>`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Plausible (Privacy-focused alternative)

Add before `</head>`:
```html
<script defer data-domain="yourdomain.com" src="https://plausible.io/js/script.js"></script>
```

---

## File Checklist for Launch

Before going live, ensure you have:

- [ ] `index.html` - Main page
- [ ] `css/style.css` - Styles
- [ ] `images/favicon.png` - Browser tab icon (32x32 or 64x64)
- [ ] `images/og-image.jpg` - Social sharing image (1200x630)
- [ ] Updated all placeholder text
- [ ] Updated meta tags (title, description, keywords)
- [ ] Updated Open Graph tags
- [ ] Updated contact information
- [ ] Tested on mobile devices
- [ ] Tested all links work
- [ ] Spell-checked content

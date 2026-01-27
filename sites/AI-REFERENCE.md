# AI Reference: Static Sites Management

> **Purpose**: Reference for AI assistant to help manage static landing pages.
> **Location**: All sites are in `/sites/` directory.
> **Hosting**: Render.com (static sites, auto-deploy on push)
> **Domains**: Cloudflare (purchase + DNS)

---

## Project Structure

```
sites/
├── example-landing/     # Template - copy for new sites
│   ├── index.html       # Main page
│   ├── css/style.css    # Styles
│   ├── js/main.js       # Scripts
│   └── images/          # Assets
├── [other-sites]/
└── AI-REFERENCE.md      # This file
```

## Blueprint Config

File: `/render.yaml`

Static site block template:
```yaml
  - type: web
    name: site-name
    runtime: static
    rootDir: sites/site-name
    staticPublishPath: .
    headers:
      - path: /*
        name: Cache-Control
        value: public, max-age=3600
```

---

## Operations

### ADD NEW SITE

1. `cp -r sites/example-landing sites/[new-name]`
2. Edit content in `sites/[new-name]/`
3. Add service block to `render.yaml`
4. `git add . && git commit -m "Add [new-name] site" && git push`
5. User must manually: Render Dashboard → Blueprints → Sync

### EDIT EXISTING SITE

1. Edit files in `sites/[site-name]/`
2. `git add . && git commit -m "Update [site-name]" && git push`
3. Auto-deploys (no manual steps)

### ADD CUSTOM DOMAIN

Instruct user to:
1. Buy domain on Cloudflare (cloudflare.com)
2. Render: Site → Settings → Custom Domains → Add `domain.com`
3. Cloudflare DNS: Add CNAME record → Target: `[site-name].onrender.com`
4. Wait 5-15 min for SSL

### DELETE SITE

1. Remove service block from `render.yaml`
2. Delete folder: `rm -rf sites/[site-name]`
3. `git add . && git commit -m "Remove [site-name]" && git push`
4. User must manually: Render Dashboard → Delete the service

---

## Site URLs

Pattern: `https://[site-name].onrender.com`

Current sites:
- example-landing → https://example-landing.onrender.com
- loan911 → https://loan911.onrender.com

---

## User Prompts

Tell user they can say:
- "Add a new site called [name]"
- "Edit the [site-name] landing page"
- "Update the headline on [site-name]"
- "Change colors on [site-name] to [color]"
- "Add custom domain to [site-name]"
- "Delete [site-name] site"

---

## Template Features (example-landing)

- Responsive design (mobile-ready)
- Sections: Hero, Features, How It Works, Pricing, Testimonials, About, Contact, Footer
- CSS variables for easy color changes (in `:root`)
- Mobile hamburger menu
- Smooth scroll navigation
- Scroll animations
- SEO meta tags (Open Graph, Twitter Cards)

## Key CSS Variables (style.css)

```css
:root {
    --color-primary: #2563eb;      /* Main brand color */
    --color-primary-dark: #1d4ed8; /* Hover states */
    --color-gray-900: #0f172a;     /* Headings */
    --color-gray-600: #475569;     /* Body text */
}
```

---

## After AI Makes Changes

Always remind user:
1. Changes pushed to GitHub
2. Render auto-deploys in ~1-2 min
3. If NEW site: "Go to Render → Blueprints → Sync"

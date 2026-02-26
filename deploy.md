# Survivor 50 Draft League — EC2 Deployment Guide

## Prerequisites

- EC2 instance running Ubuntu 22.04+ (t2.micro or t3.micro is fine)
- Security group allows inbound: **22** (SSH), **80** (HTTP), **443** (HTTPS)
- RDS security group allows inbound **5432** from your EC2's security group
- Domain `survivor.nathanblatter.com` ready to point to the EC2

## Architecture

```
Browser → Nginx (80/443) → Node/Express (3001) → RDS PostgreSQL
               ↑                   ↓
          Certbot SSL      Serves React app
                           from frontend/dist/
```

---

## Step 1: Push Code to GitHub

On your local machine:

```bash
cd ~/Desktop/Survivor50Draft
git init
git add -A
git commit -m "Initial commit"
gh repo create Survivor50Draft --private --source=. --push
```

---

## Step 2: SSH into EC2

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

---

## Step 3: Install Everything

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git certbot python3-certbot-nginx

# PM2
sudo npm install -g pm2
```

---

## Step 4: Clone the Repo

```bash
cd /home/ubuntu
git clone https://github.com/nathanzbl/Survivor50Draft.git
cd Survivor50Draft
```


---

## Step 6: Build Frontend

```bash
cd /home/ubuntu/Survivor50Draft/frontend
npm install
npm run build
cd ..
```

---

## Step 7: Build Backend

```bash
cd /home/ubuntu/Survivor50Draft/backend
npm install
npm run build
cd ..
```

Quick test (then Ctrl+C to stop):

```bash
cd backend && node dist/index.js
# Should print: "Database tables initialized" + "running on port 3001"
```

---

## Step 8: Start with PM2

```bash
cd /home/ubuntu/Survivor50Draft
pm2 start deploy/ecosystem.config.js
pm2 save
```

Set PM2 to auto-start on reboot:

```bash
pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

PM2 will print a `sudo` command — copy and run it.

Then save again:

```bash
pm2 save
```

Check it's running:

```bash
pm2 status
pm2 logs survivor50
```

---

## Step 9: Configure Nginx

```bash
sudo cp /home/ubuntu/Survivor50Draft/deploy/nginx.conf /etc/nginx/sites-available/survivor50
sudo ln -sf /etc/nginx/sites-available/survivor50 /etc/nginx/sites-enabled/survivor50
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

Visit `http://YOUR_EC2_IP` — the site should load.

---

## Step 10: Point DNS

Add an **A record** for `survivor.nathanblatter.com` → your EC2 public IP.

If using Cloudflare, set it to **DNS only** (gray cloud) until certbot is done.

Check propagation:

```bash
dig survivor.nathanblatter.com
```

---

## Step 11: HTTPS with Certbot

```bash
sudo certbot --nginx -d survivor.nathanblatter.com
```

Follow the prompts (enter email, agree to ToS, redirect HTTP to HTTPS).

Certbot automatically:
- Gets a free SSL certificate from Let's Encrypt
- Modifies your nginx config to serve HTTPS on port 443
- Sets up auto-renewal via systemd timer

Verify auto-renewal works:

```bash
sudo certbot renew --dry-run
```

Your site is now live at `https://survivor.nathanblatter.com`

---

## Redeploying After Changes

After pushing changes locally, SSH in and run:

```bash
cd /home/ubuntu/Survivor50Draft
bash deploy/redeploy.sh
```

---

## Quick Reference

| Command | What it does |
|---|---|
| `pm2 status` | Check process status |
| `pm2 logs survivor50` | Tail app logs |
| `pm2 restart survivor50` | Restart the backend |
| `pm2 monit` | Real-time CPU/memory monitor |
| `sudo nginx -t` | Test nginx config |
| `sudo systemctl restart nginx` | Restart nginx |
| `sudo certbot renew` | Renew SSL cert |
| `bash deploy/redeploy.sh` | Pull + rebuild + restart |

## Troubleshooting

**502 Bad Gateway** — Backend isn't running. Run `pm2 status` and `pm2 logs survivor50`.

**Can't connect to RDS** — RDS security group must allow port 5432 from your EC2.

**Cast photos missing** — Verify `frontend/public/cast-photos/` has 24 .webp files and was included in the git push. They get copied to `dist/` during build.

**Certbot fails** — DNS must be pointing to the EC2 already. Check with `dig survivor.nathanblatter.com`. Make sure port 80 is open in the security group.

**Admin login not working** — Verify `backend/.env` exists on the server with the right password.

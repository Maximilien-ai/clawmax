# ClawMax Setup Guide

## Gateway Pairing

1. Start the Dashboard:  
   ```bash
   ./SYSTEM/start.sh --follow
   ```
2. The dashboard will print a **Gateway Control UI** link once the backend is running. Open that link in your browser.
3. Click **Pair Device** to generate a pairing QR code. Scan the code with your agent or log in from another browser.

---

## ngrok Setup (for Public Access)

1. Install ngrok:
   ```bash
   brew install ngrok
   # or see https://ngrok.com/download
   ```
2. Get your ngrok Authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
3. Authenticate ngrok locally:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```
4. In `SYSTEM/dashboard/.env`, add:
   ```env
   NGROK_URL=yourdomain.ngrok.dev
   ```
5. Start with ngrok enabled:
   ```bash
   ./SYSTEM/start.sh --ngrok
   ```
6. The dashboard will display the public ngrok URL when ready.

For more details, see the README.md.

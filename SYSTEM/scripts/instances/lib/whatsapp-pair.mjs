#!/usr/bin/env node
/**
 * whatsapp-pair.mjs — Link a WhatsApp number to an OpenClaw instance via phone-number pairing.
 *
 * Usage (called by setup.sh, not directly):
 *   node whatsapp-pair.mjs <phone> <authDir> <baileys_path> <boom_path>
 *
 * Where:
 *   phone        — E.164 digits only, no + (e.g. 14155551234)
 *   authDir      — path to store WhatsApp credentials
 *   baileys_path — path to @whiskeysockets/baileys package root
 *   boom_path    — path to @hapi/boom package root
 *
 * Exit codes:
 *   0 — successfully linked
 *   1 — failed (logged out, timeout, or unrecoverable error)
 */

const [,, phone, authDir, baileysPkg, boomPkg] = process.argv;

if (!phone || !authDir || !baileysPkg || !boomPkg) {
  console.error('Usage: node whatsapp-pair.mjs <phone> <authDir> <baileys_path> <boom_path>');
  process.exit(1);
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } =
  await import(`${baileysPkg}/lib/index.js`);
const { Boom } = await import(`${boomPkg}/lib/index.js`);

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function connect(requestCode) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    mobile: false,
    keepAliveIntervalMs: 10_000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && requestCode) {
      try {
        const code = await sock.requestPairingCode(phone);
        console.log(`\nPAIRING CODE: ${code}`);
        console.log('─'.repeat(50));
        console.log('On your phone:');
        console.log('  WhatsApp → Settings → Linked Devices');
        console.log('  → Link a Device → "Link with phone number instead"');
        console.log('  → Enter the code above');
        console.log('─'.repeat(50));
        console.log('Waiting for you to enter the code on your phone...\n');
      } catch (e) {
        console.error('Failed to get pairing code:', e.message);
        process.exit(1);
      }
    }

    if (connection === 'open') {
      console.log('✅  Linked and connected!');
      // Give credentials a moment to flush to disk
      setTimeout(() => process.exit(0), 1500);
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;

      if (statusCode === 515) {
        // Normal WhatsApp "restart required after pairing" — reconnect WITHOUT requesting a new code
        console.log('  (WhatsApp restart after pairing — reconnecting…)');
        sock.ev.removeAllListeners();
        setTimeout(() => connect(false), 1000);
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.error('✗  Credentials rejected (logged out). Delete creds and try again.');
        process.exit(1);
      } else if (statusCode === 401) {
        console.error(`✗  Authentication failed (401). Credentials may be stale.`);
        console.error(`   Delete ${authDir}/creds.json and run again.`);
        process.exit(1);
      } else {
        // Other transient close — exit cleanly so caller can decide what to do
        console.log(`  Connection closed (status ${statusCode}). Done.`);
        process.exit(0);
      }
    }
  });
}

// Global timeout guard
const timer = setTimeout(() => {
  console.error('\n✗  Timed out after 5 minutes. Pairing code may have expired — run again.');
  process.exit(1);
}, TIMEOUT_MS);
timer.unref();

connect(true).catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

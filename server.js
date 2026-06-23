// =====================================================
// LCST CLUB - Saweria Webhook Server v2
// + Leaderboard endpoint
// Deploy ke Railway.app
// =====================================================

const express = require("express");
const crypto  = require("crypto");
const axios   = require("axios");
const Storage = require("./storage");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CONFIG = {
  SAWERIA_TOKEN:      process.env.SAWERIA_TOKEN      || "ISI_TOKEN_SAWERIA_KAMU",
  ROBLOX_API_KEY:     process.env.ROBLOX_API_KEY     || "ISI_ROBLOX_OPEN_CLOUD_API_KEY",
  ROBLOX_UNIVERSE_ID: process.env.ROBLOX_UNIVERSE_ID || "ISI_UNIVERSE_ID_GAME_KAMU",
  LEADERBOARD_SECRET: process.env.LEADERBOARD_SECRET || "lcst_secret_key_ganti_ini",
  TOPIC_DONATE:       "SaweriaDonatAlert",
  TOPIC_LEADERBOARD:  "SaweriaLeaderboard",
  PORT:               process.env.PORT || 3000,
};

// ── Helpers ──────────────────────────────────────────

function verifySaweria(req) {
  // Cek pakai Webhook Token langsung (cara Saweria yang baru)
  const token = req.headers["x-webhook-token"] 
    || req.headers["authorization"]
    || req.headers["x-saweria-token"]
    || "";
  
  if (token === CONFIG.SAWERIA_TOKEN) return true;
  
  // Cek signature MD5 lama
  const signature = req.headers["x-saweria-md5-signature"];
  if (signature) {
    const timestamp = req.headers["x-saweria-timestamp"] || "";
    const hash = crypto.createHash("md5")
      .update(timestamp + CONFIG.SAWERIA_TOKEN)
      .digest("hex");
    if (hash === signature) return true;
  }
  
  // Log semua headers untuk debug
  console.log("[Webhook] Headers diterima:", JSON.stringify(req.headers));
  return false;
}

function formatIDR(n) {
  return "Rp " + parseInt(n || 0).toLocaleString("id-ID");
}

async function sendToRoblox(topic, payload) {
  const url  = `https://apis.roblox.com/messaging-service/v1/universes/${CONFIG.ROBLOX_UNIVERSE_ID}/topics/${topic}`;
  const body = JSON.stringify({ message: JSON.stringify(payload) });
  try {
    await axios.post(url, body, {
      headers: { "Content-Type": "application/json", "x-api-key": CONFIG.ROBLOX_API_KEY },
    });
    return true;
  } catch (e) {
    console.error("[Roblox] Gagal kirim ke topic", topic, ":", e.response?.data || e.message);
    return false;
  }
}

// ── Webhook Saweria ───────────────────────────────────

app.post("/saweria", async (req, res) => {
  if (!verifySaweria(req)) {
    console.warn("[Webhook] Signature tidak valid");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const data         = req.body;
  const amountRaw    = parseInt(data.amount_raw || data.amount || "0", 10);
  const donatorName  = data.donator_name || data.name || "Anonim";
  const pesan        = data.message || "";
  const robloxUser   = parseRobloxUsername(pesan, donatorName);
  const amtFormatted = formatIDR(amountRaw);

  // Tier efek
  let tier, durationSec, effectColor;
  if      (amountRaw >= 100000) { tier = 3; durationSec = 15; effectColor = "GOLD";   }
  else if (amountRaw >= 50000)  { tier = 2; durationSec = 10; effectColor = "ORANGE"; }
  else                          { tier = 1; durationSec = 7;  effectColor = "RED";    }

  // Simpan ke leaderboard
  const donorRecord = Storage.addDonation(
    robloxUser, donatorName, amountRaw, amtFormatted, pesan
  );

  // Ambil top 50 terbaru
  const top50 = Storage.getTop(50);

  // Kirim notif donasi ke game
  const donatePayload = {
    type: "SAWERIA", donatorName, robloxUsername: robloxUser,
    pesan, amountRaw, amountFormatted: amtFormatted,
    tier, durationSec, effectColor,
    donorTotal:        donorRecord.totalFormatted,
    donorTotalRaw:     donorRecord.totalRaw,
    donorRank:         top50.findIndex(d => d.robloxUsername.toLowerCase() === robloxUser.toLowerCase()) + 1,
  };
  await sendToRoblox(CONFIG.TOPIC_DONATE, donatePayload);

  // Kirim update leaderboard ke game (top 50)
  await sendToRoblox(CONFIG.TOPIC_LEADERBOARD, { type: "UPDATE", top: top50 });

  console.log(`[Saweria] ${donatorName} (${robloxUser}) → ${amtFormatted} | Tier ${tier}`);
  res.json({ success: true });
});

// ── REST Endpoint: ambil leaderboard (dipanggil Roblox polling) ──

// Roblox tidak bisa terima webhook, tapi bisa HTTP GET
// SaweriaHandler.lua akan poll endpoint ini setiap 60 detik
app.get("/leaderboard", (req, res) => {
  const secret = req.headers["x-lcst-secret"] || req.query.secret || "";
  if (secret !== CONFIG.LEADERBOARD_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const top = Storage.getTop(50);
  res.json({ success: true, data: top, updatedAt: new Date().toISOString() });
});

// Leaderboard publik (tanpa secret, untuk embed web jika mau)
app.get("/leaderboard/public", (req, res) => {
  const top = Storage.getTop(50);
  res.json({ success: true, data: top });
});

// History terbaru
app.get("/history", (req, res) => {
  const secret = req.headers["x-lcst-secret"] || req.query.secret || "";
  if (secret !== CONFIG.LEADERBOARD_SECRET) return res.status(401).json({ error: "Unauthorized" });
  res.json({ success: true, data: Storage.getHistory(30) });
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "LCST Saweria Server v2 ✅", donors: Storage.getTop(50).length });
});

// Test endpoint - kirim donasi palsu
app.get("/test-webhook", async (req, res) => {
  const fakeData = {
    amount_raw: "10000",
    donator_name: "TestUser",
    message: "roblox: LCSTxUncleK"
  };
  
  const Storage = require("./storage");
  const robloxUser = "LCSTxUncleK";
  Storage.addDonation(robloxUser, "TestUser", 10000, "Rp 10.000", "test");
  
  const top50 = Storage.getTop(50);
  await sendToRoblox("SaweriaLeaderboard", { type: "UPDATE", top: top50 });
  
  const donatePayload = {
    type: "SAWERIA",
    donatorName: "TestUser",
    robloxUsername: robloxUser,
    pesan: "test",
    amountRaw: 10000,
    amountFormatted: "Rp 10.000",
    tier: 1,
    durationSec: 7,
    effectColor: "RED",
  };
  await sendToRoblox("SaweriaDonatAlert", donatePayload);
  
  res.json({ success: true, sent: donatePayload, leaderboard: top50 });
});

app.listen(CONFIG.PORT, () => console.log(`[Server] Port ${CONFIG.PORT}`));

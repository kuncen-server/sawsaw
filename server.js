// =====================================================
// LCST CLUB - Saweria Webhook Server
// Deploy ke Railway.app (gratis)
// =====================================================

const express = require("express");
const crypto  = require("crypto");
const axios   = require("axios");

const app  = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// KONFIGURASI — isi sesuai milikmu
// =====================================================
const CONFIG = {
  SAWERIA_TOKEN:      process.env.SAWERIA_TOKEN      || "ISI_TOKEN_SAWERIA_KAMU",
  ROBLOX_API_KEY:     process.env.ROBLOX_API_KEY     || "ISI_ROBLOX_OPEN_CLOUD_API_KEY",
  ROBLOX_UNIVERSE_ID: process.env.ROBLOX_UNIVERSE_ID || "ISI_UNIVERSE_ID_GAME_KAMU",
  TOPIC_DONATE:       "SaweriaDonatAlert",
  TOPIC_LEADERBOARD:   "SaweriaLeaderboard",
  PORT:               process.env.PORT || 8080,
};

// =====================================================
// VERIFIKASI SIGNATURE SAWERIA
// Saweria mengirim header X-Saweria-MD5-SignatureF
// =====================================================
function verifySaweria(req) {
  const signature = req.headers["x-saweria-md5-signature"];
  if (!signature) return false;

  // Saweria: MD5(timestamp + token)
  const timestamp = req.headers["x-saweria-timestamp"] || "";
  const hash = crypto
    .createHash("md5")
    .update(timestamp + CONFIG.SAWERIA_TOKEN)
    .digest("hex");

  return hash === signature;
}

// =====================================================
// PARSE USERNAME ROBLOX DARI PESAN
// Format yang diterima dari kolom Pesan Saweria:
//   "roblox: NamaUser"
//   "roblox:NamaUser"
//   "#NamaUser"
//   atau nama langsung kalau tidak ada prefix
// =====================================================
function parseRobloxUsername(pesan, namaAnonim) {
  if (!pesan) return namaAnonim || "Anonim";

  // coba format "roblox: xxx" atau "roblox:xxx"
  const m1 = pesan.match(/roblox\s*:\s*(\S+)/i);
  if (m1) return m1[1].trim();

  // coba format "#username"
  const m2 = pesan.match(/#(\S+)/);
  if (m2) return m2[1].trim();

  // fallback: nama pengirim
  return namaAnonim || "Anonim";
}

// =====================================================
// KIRIM KE ROBLOX via Open Cloud MessagingService
// =====================================================
async function sendToRoblox(payload) {
  const url = `https://apis.roblox.com/messaging-service/v1/universes/${CONFIG.ROBLOX_UNIVERSE_ID}/topics/${CONFIG.TOPIC}`;
  const body = JSON.stringify({ message: JSON.stringify(payload) });

  try {
    const res = await axios.post(url, body, {
      headers: {
        "Content-Type":  "application/json",
        "x-api-key":     CONFIG.ROBLOX_API_KEY,
      },
    });
    console.log("[Roblox] Terkirim:", res.status, payload);
    return true;
  } catch (err) {
    console.error("[Roblox] Gagal kirim:", err.response?.data || err.message);
    return false;
  }
}

// =====================================================
// ENDPOINT WEBHOOK SAWERIA
// Daftarkan URL ini di dashboard Saweria:
//   http://sawsaw-production.up.railway.app
// =====================================================
app.post("/saweria", async (req, res) => {
  // 1. Verifikasi signature
  if (!verifySaweria(req)) {
    console.warn("[Webhook] Signature tidak valid, ditolak.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const data = req.body;
  console.log("[Webhook] Diterima:", JSON.stringify(data, null, 2));

  // 2. Ambil data donasi dari payload Saweria
  // Field Saweria: amount_raw (angka IDR), donator_name, message, type
  const amountRaw   = parseInt(data.amount_raw || data.amount || "0", 10);
  const donatorName = data.donator_name || data.name || "Anonim";
  const pesan       = data.message || "";
  const mediaUrl    = data.media?.url || null;

  // 3. Parse username Roblox dari pesan
  const robloxUsername = parseRobloxUsername(pesan, donatorName);

  // 4. Tentukan tier efek berdasarkan nominal IDR
  let tier, durationSec, effectColor;
  if (amountRaw >= 100000) {
    tier        = 3;
    durationSec = 15;
    effectColor = "GOLD";      // emas gemerlap
  } else if (amountRaw >= 50000) {
    tier        = 2;
    durationSec = 10;
    effectColor = "ORANGE";    // oranye terang
  } else {
    tier        = 1;
    durationSec = 7;
    effectColor = "RED";       // merah gemerlap
  }

  // 5. Buat payload untuk Roblox
  const robloxPayload = {
    type:            "SAWERIA",
    donatorName:     donatorName,
    robloxUsername:  robloxUsername,
    pesan:           pesan,
    amountRaw:       amountRaw,
    amountFormatted: formatIDR(amountRaw),
    tier:            tier,
    durationSec:     durationSec,
    effectColor:     effectColor,
    mediaUrl:        mediaUrl,
  };

  // 6. Kirim ke Roblox
  const ok = await sendToRoblox(robloxPayload);
  if (ok) {
    res.json({ success: true, sent: robloxPayload });
  } else {
    res.status(500).json({ error: "Gagal kirim ke Roblox" });
  }
});

// Format IDR
function formatIDR(n) {
  return "Rp " + n.toLocaleString("id-ID");
}

// Health check
app.get("/", (req, res) => {
  res.json({
    status:  "LCST Saweria Webhook Server aktif ✅",
    version: "1.0.0",
  });
});

app.listen(CONFIG.PORT, () => {
  console.log(`[Server] Jalan di port ${CONFIG.PORT}`);
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ALLOWED_USER_ID = parseInt(Deno.env.get("TELEGRAM_ALLOWED_USER_ID") ?? "0");
const SUPABASE_USER_ID = Deno.env.get("APP_USER_ID")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EXPENSE_CATEGORIES = [
  "อาหาร", "เดินทาง", "ช้อปปิ้ง", "บันเทิง",
  "สุขภาพ", "การศึกษา", "ค่าเช่า", "ค่าน้ำค่าไฟ", "อื่นๆ",
];

const CAT_EMOJI: Record<string, string> = {
  "อาหาร": "🍔", "เดินทาง": "🚗", "ช้อปปิ้ง": "🛍️",
  "บันเทิง": "🎮", "สุขภาพ": "💊", "การศึกษา": "📚",
  "ค่าเช่า": "🏠", "ค่าน้ำค่าไฟ": "💡", "อื่นๆ": "📦",
};

const TG = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ── Telegram helpers ──────────────────────────────────────

async function sendMessage(chat_id: number, text: string, reply_markup?: object) {
  await fetch(`${TG}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "HTML", reply_markup }),
  });
}

async function editMessage(chat_id: number, message_id: number, text: string, reply_markup?: object) {
  await fetch(`${TG}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id, message_id, text, parse_mode: "HTML", reply_markup }),
  });
}

async function answerCallback(callback_query_id: string, text?: string) {
  await fetch(`${TG}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id, text }),
  });
}

async function getPhotoBase64(file_id: string): Promise<string> {
  const res = await fetch(`${TG}/getFile?file_id=${file_id}`);
  const { result } = await res.json();
  const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${result.file_path}`);
  const buffer = await fileRes.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ── Gemini OCR ────────────────────────────────────────────

async function scanReceipt(base64: string) {
  const today = new Date().toISOString().split("T")[0];
  const prompt = `คุณคือระบบอ่านใบเสร็จ/สลิปธนาคาร

ขั้นตอนที่ 1 — วิเคราะห์ก่อน (แสดงออกมาด้วย):
- วันที่ในสลิป: [คัดลอกตัวเลขตรงๆ จากรูป] → เดือน [ชื่อเดือน] = [เลข] ปี [เลข] → [คำนวณ] → YYYY-MM-DD
- เวลาในสลิป: [คัดลอกตัวเลขตรงๆ เช่น 18:45 หรือ 18:45 น.] → HH:MM (24 ชม.)
- จำนวนเงิน: ยอดหลัก [X] บาท, ค่าธรรมเนียม [Y] บาท → ใช้ [X]
- ผู้รับ/ร้านค้า: [ชื่อเต็ม] → ชื่อสั้น: [ชื่อ]
- หมวดหมู่: เลือก [หมวด] เพราะ [เหตุผล]

ขั้นตอนที่ 2 — ตอบ JSON บรรทัดสุดท้าย:
{"amount":0.00,"date":"YYYY-MM-DD","time":"HH:MM","description":"ชื่อร้านสั้นๆ","category":"หมวด"}

กฎวันที่ (ต้องคำนวณทุกครั้ง):
- เดือนไทย: ม.ค.=01 ก.พ.=02 มี.ค.=03 เม.ย.=04 พ.ค.=05 มิ.ย.=06 ก.ค.=07 ส.ค.=08 ก.ย.=09 ต.ค.=10 พ.ย.=11 ธ.ค.=12
- ปี 4 หลัก: ลบ 543 / ปี 2 หลัก: บวก 2500 แล้วลบ 543
- ตัวอย่าง: "28 ก.พ. 69" → ก.พ.=02, 69+2500-543=2026 → 2026-02-28
- วันนี้คือ ${today} (ค.ศ.) ถ้าไม่มีวันที่ในสลิป

หมวดหมู่ที่ใช้ได้: ${EXPENSE_CATEGORIES.join(", ")}
ถ้าไม่มีข้อมูลให้ใส่ null ใน JSON`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: "image/jpeg", data: base64 } },
          { text: prompt },
        ]}],
        generationConfig: { maxOutputTokens: 1024, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  const result = await res.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const match = cleaned.match(/\{.*\}/s);
  if (!match) return null;

  const data = JSON.parse(match[0]);
  const timeMatch = typeof data.time === "string" && /^\d{2}:\d{2}$/.test(data.time) ? data.time : null;
  return {
    amount: typeof data.amount === "number" && data.amount > 0 ? data.amount : null,
    date: data.date ?? today,
    time: timeMatch,
    description: data.description ?? null,
    category: EXPENSE_CATEGORIES.includes(data.category) ? data.category : null,
  };
}

// ── Summary builder ───────────────────────────────────────

function buildSummary(pending: any[]) {
  const ready = pending.filter((p) => p.status === "ready");
  const failed = pending.filter((p) => p.status === "failed");
  const waiting = pending.filter((p) => p.status === "scanning");

  if (waiting.length > 0) {
    return { text: `⏳ ยังสแกนไม่เสร็จ ${waiting.length} ใบ\nรอสักครู่แล้วพิมพ์ /done อีกครั้ง`, ready: [] };
  }

  let text = `📊 <b>สรุป ${ready.length + failed.length} ใบ</b>\n\n`;
  ready.forEach((p) => {
    const emoji = CAT_EMOJI[p.category] ?? "📦";
    const desc = p.description ? ` · ${p.description}` : "";
    text += `${emoji} ฿${Number(p.amount).toLocaleString()} · ${p.category}${desc}\n`;
  });
  if (failed.length > 0) text += `\n⚠️ อ่านไม่ได้ ${failed.length} ใบ (ข้ามไป)\n`;
  text += `\nกด ✅ เพื่อบันทึก <b>${ready.length} รายการ</b>`;

  return { text, ready };
}

// ── Main handler ──────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");

  const update = await req.json();
  console.log("update:", JSON.stringify(update).slice(0, 300));
  console.log("ALLOWED_USER_ID:", ALLOWED_USER_ID);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Callback query (button press) ──
  if (update.callback_query) {
    const q = update.callback_query;
    const chatId: number = q.message.chat.id;
    const msgId: number = q.message.message_id;
    const userId: number = q.from.id;
    const data: string = q.data;

    if (userId !== ALLOWED_USER_ID) {
      await answerCallback(q.id, "ไม่มีสิทธิ์ใช้งาน");
      return new Response("ok");
    }

    // ── ✅ Confirm บันทึกทั้งหมด ──
    if (data === "confirm") {
      const { data: pending } = await supabase
        .from("telegram_pending")
        .select("*")
        .eq("telegram_user_id", userId)
        .eq("status", "ready");

      if (!pending?.length) {
        await answerCallback(q.id, "ไม่มีรายการที่พร้อมบันทึก");
        return new Response("ok");
      }

      const now = new Date();
      const expenses = pending.map((p: any, i: number) => {
        let d: Date;
        if (p.time && /^\d{2}:\d{2}$/.test(p.time)) {
          d = new Date(`${p.date}T${p.time}:${String(i).padStart(2, "0")}`);
        } else {
          d = new Date(p.date + "T00:00:00");
          d.setHours(now.getHours(), now.getMinutes(), now.getSeconds() + i);
        }
        return {
          id: crypto.randomUUID(),
          amount: p.amount,
          category: p.category,
          description: p.description ?? "",
          date: d.toISOString(),
          type: "daily",
          user_id: SUPABASE_USER_ID,
        };
      });

      await supabase.from("expenses").insert(expenses);
      await supabase.from("telegram_pending").delete().eq("telegram_user_id", userId);

      await answerCallback(q.id);
      await editMessage(chatId, msgId, `✅ บันทึกแล้ว <b>${expenses.length} รายการ</b>\nเปิดแอปดูได้เลยครับ`);
    }

    // ── ❌ ยกเลิก ──
    else if (data === "cancel") {
      await supabase.from("telegram_pending").delete().eq("telegram_user_id", userId);
      await answerCallback(q.id);
      await editMessage(chatId, msgId, "❌ ยกเลิกแล้ว");
    }

    // ── เลือก category: "cat:อาหาร:uuid" ──
    else if (data.startsWith("cat:")) {
      const [, category, pendingId] = data.split(":");
      await supabase
        .from("telegram_pending")
        .update({ category, status: "ready" })
        .eq("id", pendingId);
      await answerCallback(q.id, `${CAT_EMOJI[category]} ${category}`);
      await editMessage(chatId, msgId, `✅ ฿ · ${category} — บันทึกลง queue แล้ว\nพิมพ์ /done เมื่อส่งครบ`);
    }

    return new Response("ok");
  }

  // ── Message ──
  const message = update.message;
  if (!message) return new Response("ok");

  const chatId: number = message.chat.id;
  const userId: number = message.from.id;

  if (userId !== ALLOWED_USER_ID) {
    await sendMessage(chatId, "ไม่มีสิทธิ์ใช้งาน");
    return new Response("ok");
  }

  // /start
  if (message.text === "/start") {
    await sendMessage(
      chatId,
      "👋 สวัสดี! <b>Narix Bot</b>\n\nส่งรูปสลิปมาได้เลย ส่งกี่ใบก็ได้\nพิมพ์ /done เมื่อส่งครบเพื่อดู summary"
    );
    return new Response("ok");
  }

  // /done — แสดง summary
  if (message.text === "/done") {
    const { data: pending } = await supabase
      .from("telegram_pending")
      .select("*")
      .eq("telegram_user_id", userId);

    if (!pending?.length) {
      await sendMessage(chatId, "ไม่มีรายการรอบันทึก\nส่งรูปสลิปมาก่อนได้เลยครับ");
      return new Response("ok");
    }

    const { text, ready } = buildSummary(pending);

    if (ready.length > 0) {
      await sendMessage(chatId, text, {
        inline_keyboard: [[
          { text: `✅ บันทึก ${ready.length} รายการ`, callback_data: "confirm" },
          { text: "❌ ยกเลิก", callback_data: "cancel" },
        ]],
      });
    } else {
      await sendMessage(chatId, text);
    }

    return new Response("ok");
  }

  // /clear — ล้าง queue
  if (message.text === "/clear") {
    await supabase.from("telegram_pending").delete().eq("telegram_user_id", userId);
    await sendMessage(chatId, "🗑️ ล้าง queue แล้ว");
    return new Response("ok");
  }

  // รูปภาพ
  if (message.photo) {
    const photo = message.photo[message.photo.length - 1]; // highest res
    const { data: row } = await supabase
      .from("telegram_pending")
      .insert({ telegram_user_id: userId, status: "scanning" })
      .select()
      .single();

    await sendMessage(chatId, "🔍 กำลังอ่านสลิป...");

    try {
      const base64 = await getPhotoBase64(photo.file_id);
      const result = await scanReceipt(base64);

      if (!result || !result.amount) {
        await supabase.from("telegram_pending").update({ status: "failed" }).eq("id", row.id);
        await sendMessage(chatId, "⚠️ อ่านไม่ได้ จะข้ามรายการนี้\nพิมพ์ /done เมื่อส่งครบ");
        return new Response("ok");
      }

      if (!result.category) {
        // ถามให้เลือก category
        await supabase.from("telegram_pending").update({
          amount: result.amount,
          date: result.date,
          time: result.time ?? null,
          description: result.description,
          status: "need_category",
        }).eq("id", row.id);

        const catButtons = EXPENSE_CATEGORIES.map((cat) => ({
          text: `${CAT_EMOJI[cat]} ${cat}`,
          callback_data: `cat:${cat}:${row.id}`,
        }));
        const rows = [];
        for (let i = 0; i < catButtons.length; i += 3) rows.push(catButtons.slice(i, i + 3));

        await sendMessage(
          chatId,
          `💰 ฿${result.amount.toLocaleString()} · ${result.description ?? "ไม่ทราบชื่อ"}\n\nเลือกหมวดหมู่:`,
          { inline_keyboard: rows }
        );
      } else {
        await supabase.from("telegram_pending").update({
          amount: result.amount,
          date: result.date,
          time: result.time ?? null,
          description: result.description,
          category: result.category,
          status: "ready",
        }).eq("id", row.id);

        const emoji = CAT_EMOJI[result.category] ?? "📦";
        const timeStr = result.time ? ` · ${result.time}` : "";
        await sendMessage(
          chatId,
          `${emoji} ฿${result.amount.toLocaleString()} · ${result.category} · ${result.description ?? "-"} · ${result.date ?? "-"}${timeStr}\n\nพิมพ์ /done เมื่อส่งครบ`
        );
      }
    } catch (e) {
      await supabase.from("telegram_pending").update({ status: "failed" }).eq("id", row.id);
      await sendMessage(chatId, `❌ Error: ${String(e).slice(0, 100)}`);
    }

    return new Response("ok");
  }

  await sendMessage(chatId, "ส่งรูปสลิปมาได้เลย หรือพิมพ์ /done เพื่อดู summary");
  return new Response("ok");
});

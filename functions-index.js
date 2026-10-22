// اختياري (يتطلب خطة Blaze): إشعار تيليغرام من الخادم عند إنشاء أي طلب.
// التوكن لا يغادر الخادم أبداً، والإجمالي يُحسب من أسعار المنتجات الحقيقية.
// الاستخدام: firebase init functions  ثم استبدل functions/index.js بهذا الملف
// ثم: firebase deploy --only functions
// بعد التفعيل: ألغِ خيار "إرسال الإشعار من هذه اللوحة" في إعدادات اللوحة.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

exports.notifyNewOrder = onDocumentCreated("orders/{orderId}", async (event) => {
  const o = event.data && event.data.data();
  if (!o) return;

  const db = getFirestore();
  const s = (await db.doc("settings/telegram").get()).data();
  if (!s || !s.botToken || !s.chatId) return;

  let total = 0, mismatch = false;
  const lines = [];
  for (const it of (Array.isArray(o.items) ? o.items : []).slice(0, 20)) {
    const qty = Math.floor(Number(it.quantity));
    let unit = NaN;
    try {
      const snap = await db.collection("products").doc(String(it.id)).get();
      if (snap.exists) unit = Number(snap.data().price);
    } catch (e) { /* معرّف غير صالح */ }
    if (!Number.isFinite(unit) || !(qty >= 1 && qty <= 100)) { mismatch = true; lines.push(`- ${it.name} (؟)`); continue; }
    if (Number(it.price) !== unit) mismatch = true;
    total += unit * qty;
    lines.push(`- ${it.name} (${qty})`);
  }
  if (Number(o.totalPrice) !== total) mismatch = true;

  const c = o.customer || {};
  let text =
    `🛍️ طلب جديد (MB STORE)\n\n👤 ${c.name}\n📞 ${c.phone}\n📍 ${c.wilaya}\n🏠 ${c.address || "غير محدد"}\n\n` +
    `📦\n${lines.join("\n")}\n\n💰 الإجمالي المحسوب: ${total} د.ج`;
  if (mismatch) text += "\n\n⚠️ تنبيه: الأسعار المرسلة لا تطابق أسعار المتجر!";

  // نص عادي بدون parse_mode لمنع حقن Markdown
  await fetch(`https://api.telegram.org/bot${s.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: s.chatId, text: text.slice(0, 3500) }),
  });
});

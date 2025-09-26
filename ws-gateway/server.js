const { Kafka, logLevel } = require("kafkajs");
const WebSocket = require("ws");

// === تنظیمات ===
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:19092").split(",");
const KAFKA_TOPIC   = process.env.KAFKA_TOPIC || "ohlcv_raw";
const WS_PORT       = parseInt(process.env.WS_PORT || "4000", 10);

// === Kafka Consumer ===
const kafka = new Kafka({
  clientId: "nexusa-webapp-consumer",
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.NOTHING,
});
const consumer = kafka.consumer({ groupId: "nexusa-webapp-consumer" });

// === WebSocket Server ===
const wss = new WebSocket.Server({ port: WS_PORT }, () =>
  console.log(`[WS] listening on ws://localhost:${WS_PORT}`)
);

// broadcast helper
function broadcast(obj) {
  const msg = typeof obj === "string" ? obj : JSON.stringify(obj);
  wss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.send(msg));
}

// health ping to keep connections alive behind proxies
setInterval(() => broadcast({ type: "ping", ts: Date.now() }), 15000);

(async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  console.log(`[Kafka] connected → topic=${KAFKA_TOPIC}, brokers=${KAFKA_BROKERS.join(",")}`);

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ message }) => {
      try {
        // پیام‌های OHLCV ما JSON هستند
        const str = message.value.toString();
        // (اختیاری) فیلتر/سفارش‌سازی قبل از ارسال
        broadcast({ type: "ohlcv", data: JSON.parse(str) });
      } catch (e) {
        // اگر JSON نبود، خام بفرست
        broadcast({ type: "ohlcv_raw", data: message.value.toString() });
      }
    },
  });
})().catch((e) => {
  console.error("[Kafka] fatal:", e);
  process.exit(1);
});

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await consumer.disconnect().catch(() => {});
  process.exit(0);
});

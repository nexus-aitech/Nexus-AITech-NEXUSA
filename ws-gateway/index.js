import { Kafka } from "kafkajs";
import WebSocket, { WebSocketServer } from "ws";

// 1. Kafka Consumer
const kafka = new Kafka({
  clientId: "ws-gateway",
  brokers: ["localhost:19092"], // Redpanda OUTSIDE listener
});

const consumer = kafka.consumer({ groupId: "ws-gateway-group" });

// 2. WebSocket Server
const wss = new WebSocketServer({ port: 8080 });
const clients = new Set();

wss.on("connection", (ws) => {
  console.log("✅ Client connected");
  clients.add(ws);

  ws.on("close", () => {
    console.log("❌ Client disconnected");
    clients.delete(ws);
  });
});

// 3. Start consuming from Kafka
async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: "ohlcv_raw", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const payload = message.value?.toString();
      if (payload) {
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    },
  });

  console.log("🚀 Kafka consumer started and WebSocket server is running at ws://localhost:8080");
}

run().catch(console.error);

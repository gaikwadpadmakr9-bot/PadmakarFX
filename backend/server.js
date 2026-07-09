const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let running = true;

let account = {
  balance: 100000,
  equity: 100000,
  profit: 0,
  trades: 0
};

setInterval(() => {
  if (!running) return;

  const move = (Math.random() - 0.5) * 250;

  account.balance += move;
  account.equity = account.balance + (Math.random() * 500 - 250);
  account.profit = account.balance - 100000;

  if (Math.random() > 0.7) {
    account.trades++;
  }
}, 2000);

app.get("/api/data", (req, res) => {
  res.json({
    balance: account.balance.toFixed(2),
    equity: account.equity.toFixed(2),
    profit: account.profit.toFixed(2),
    trades: account.trades,
    status: running ? "RUNNING" : "STOPPED"
  });
});

app.get("/api/start", (req, res) => {
  running = true;
  res.json({ message: "EA Started" });
});

app.get("/api/stop", (req, res) => {
  running = false;
  res.json({ message: "EA Stopped" });
});
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    application: "PadmakarFX",
    version: "2.0.0",
    status: "Online",
    time: new Date()
  });
});

app.get("/", (req, res) => {
  res.send("PadmakarFX Backend Running");
});

app.listen(3000, () => {
  console.log("================================");
  console.log("PadmakarFX Backend Started");
  console.log("http://localhost:3000");
  console.log("================================");
});
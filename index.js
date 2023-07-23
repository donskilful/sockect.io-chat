const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = "";

// Message schema
const messageSchema = new mongoose.Schema({
  content: String,
  from: String,
  to: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// Store the connected users and their corresponding sockets
const users = {};
const typingUsers = {};

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    // useCreateIndex: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });

app.use(express.static(__dirname + "/public"));
app.use(express.json()); // Parse JSON request bodies

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("login", (username) => {
    users[username] = socket.id;
    io.emit("user-list", Object.keys(users));
  });

  socket.on("chat message", async (message) => {
    io.emit("chat message", message);

    const publicMessage = new Message({
      content: message,
      from: socket.id,
      to: "public",
    });
    await publicMessage.save();
  });

  socket.on("private-message", async ({ to, message }) => {
    const toSocketId = users[to];
    if (toSocketId) {
      const from = Object.keys(users).find((key) => users[key] === socket.id);
      socket.to(toSocketId).emit("private-message", { from, message });

      const privateMessage = new Message({
        content: message,
        from: socket.id,
        to: to,
      });
      await privateMessage.save();
    } else {
      socket.emit("private-message", {
        from: "Server",
        message: `User '${to}' not found or offline.`,
      });
    }
  });

  socket.on("typing", () => {
    const username = Object.keys(users).find((key) => users[key] === socket.id);
    if (username) {
      typingUsers[socket.id] = username;
      socket.broadcast.emit("user-typing", username);
    }
  });

  socket.on("stop typing", () => {
    const username = typingUsers[socket.id];
    if (username) {
      delete typingUsers[socket.id];
      socket.broadcast.emit("user-stop-typing", username);
    }
  });

  socket.on("disconnect", () => {
    const username = Object.keys(users).find((key) => users[key] === socket.id);
    if (username) {
      delete users[username];
      io.emit("user-list", Object.keys(users));
    }
    delete typingUsers[socket.id];
    console.log("A user disconnected");
  });
});

app.post("/save-message", async (req, res) => {
  try {
    const { content, from, to } = req.body;
    const message = new Message({ content, from, to });
    await message.save();
    res.sendStatus(200);
  } catch (error) {
    console.error("Error saving message to the database:", error);
    res.sendStatus(500);
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

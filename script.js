import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, onValue, push, set, onChildAdded, off } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const chatList = document.getElementById("chatList");
const messagesDiv = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const fileInput = document.getElementById("fileInput");
const chatPartnerName = document.getElementById("chatPartnerName");
const chatOwnName = document.getElementById("chatOwnName");

const modal = document.getElementById("fatFileModal");
const closeModalBtn = document.getElementById("closeModal");

let currentUserUid = null;
let currentUsername = null;
let currentChatUid = null;
let currentChatUsername = null;

// ---- Sound Alert ----
const notificationSound = new Audio("/sounds/notification.mp3"); // change path

// ---- Title Notifications ----
let unreadCount = 0;
const originalTitle = document.title;

function updateTitle() {
  if (unreadCount > 0) {
    document.title = `(${unreadCount}) New message${unreadCount > 1 ? "s" : ""} - ${originalTitle}`;
  } else {
    document.title = originalTitle;
  }
}

window.addEventListener("focus", () => {
  unreadCount = 0;
  updateTitle();
});

// Modal
function showFatFileModal() {
  modal.style.display = "flex";
}
closeModalBtn.addEventListener("click", () => {
  modal.style.display = "none";
});

// Sidebar toggle
const sidebar = document.getElementById("sidebar");
document.getElementById("openSidebar").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});
function closeSidebar() {
  sidebar.classList.remove("open");
}

// Auth
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUserUid = user.uid;

  const usernameRef = ref(db, `users/${currentUserUid}/username`);
  onValue(usernameRef, (snapshot) => {
    currentUsername = snapshot.val() || "Unknown";
    chatOwnName.innerHTML = "Signed in As - " + currentUsername;
    populateSidebar();
  });

  // 🔔 Ask for notification permission
  if (Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
  }

  // 🔔 Global message listener
  const allMessagesRef = ref(db, "messages");
  onChildAdded(allMessagesRef, (snapshot) => {
    const msg = snapshot.val();
    if (!msg) return;

    if (msg.receiverUid === currentUserUid && msg.senderUid !== currentUserUid) {
      // Play sound
      notificationSound.currentTime = 0;
      notificationSound.play().catch(() => {});

      // Increase unread + update title
      if (document.hidden) {
        unreadCount++;
        updateTitle();
      }

      // Desktop notification
      if (Notification.permission === "granted" && document.hidden) {
        const notif = new Notification(`New message from ${msg.senderUsername}`, {
          body: msg.type === "text" ? msg.content : `[File] ${msg.fileName || "Attachment"}`,
          icon: "/chat-icon.png"
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      }
    }
  });
});

// Sidebar population
function populateSidebar() {
  const usersRef = ref(db, "users");
  onValue(usersRef, (snapshot) => {
    chatList.innerHTML = "";
    const usersData = snapshot.val();
    if (!usersData) return;

    let userArray = [];
    for (const uid in usersData) {
      if (uid === currentUserUid) continue;
      const user = usersData[uid];
      if (!user.username) continue;
      userArray.push({ uid, username: user.username });
    }

    userArray.sort((a, b) => a.username.localeCompare(b.username));

    userArray.forEach(({ uid, username }, index) => {
      const li = document.createElement("li");
      li.classList.add("chat");
      li.dataset.uid = uid;
      li.dataset.username = username;

      const nameSpan = document.createElement("span");
      nameSpan.classList.add("chat-username");
      nameSpan.textContent = username;

      const previewSpan = document.createElement("span");
      previewSpan.classList.add("chat-preview");
      previewSpan.textContent = "Loading...";

      li.appendChild(nameSpan);
      li.appendChild(previewSpan);

      li.addEventListener("click", () => {
        selectChat(uid, username);
        if (window.innerWidth < 768) {
          closeSidebar();
        }
      });

      chatList.appendChild(li);

      // Load last message preview
      const messagesRef = ref(db, "messages");
      onValue(messagesRef, (msgSnap) => {
        let lastMsg = null;
        msgSnap.forEach((child) => {
          const msg = child.val();
          const isRelevant =
            (msg.senderUid === currentUserUid && msg.receiverUid === uid) ||
            (msg.senderUid === uid && msg.receiverUid === currentUserUid);

          if (isRelevant && (!lastMsg || msg.time > lastMsg.time)) {
            lastMsg = msg;
          }
        });
        if (lastMsg) {
          previewSpan.textContent =
            lastMsg.type === "text"
              ? lastMsg.content
              : `[File] ${lastMsg.fileName || "Attachment"}`;
        } else {
          previewSpan.textContent = "No messages yet";
        }
      });

      if (index === 0 && !currentChatUid) {
        selectChat(uid, username);
      }
    });
  });
}

// Select chat
function selectChat(uid, username) {
  currentChatUid = uid;
  currentChatUsername = username;
  chatPartnerName.textContent = currentChatUsername;
  messagesDiv.innerHTML = "";

  const messagesRef = ref(db, "messages");
  onValue(messagesRef, (snapshot) => {
    messagesDiv.innerHTML = "";
    snapshot.forEach((child) => {
      const msg = child.val();

      const isRelevant =
        (msg.senderUid === currentUserUid && msg.receiverUid === currentChatUid) ||
        (msg.senderUid === currentChatUid && msg.receiverUid === currentUserUid);

      if (!isRelevant) return;

      const div = document.createElement("div");
      div.classList.add("message", msg.senderUid === currentUserUid ? "sent" : "received");

      if (msg.type === "file") {
        if (msg.mimeType && msg.mimeType.startsWith("image/")) {
          div.innerHTML = `<p><img src="${msg.content}" alt="${msg.fileName}" style="max-width:150px; border-radius:8px;"></p>
                           <span class="time">${new Date(msg.time).toLocaleTimeString()}</span>`;
        } else {
          div.innerHTML = `<p><a href="${msg.content}" download="${msg.fileName}">${msg.fileName}</a></p>
                           <span class="time">${new Date(msg.time).toLocaleTimeString()}</span>`;
        }
      } else {
        div.innerHTML = `<p>${msg.content}</p>
                         <span class="time">${new Date(msg.time).toLocaleTimeString()}</span>`;
      }

      messagesDiv.appendChild(div);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// ---- Send Message Function ----
async function sendMessage(text, file) {
  if (!currentChatUid) return alert("Select a chat first");

  if (file) {
    if (file.size > 3 * 1024 * 1024) {
      showFatFileModal();
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result;

      const msgRef = push(ref(db, "messages"));
      set(msgRef, {
        senderUid: currentUserUid,
        senderUsername: currentUsername,
        receiverUid: currentChatUid,
        receiverUsername: currentChatUsername,
        type: "file",
        fileName: file.name,
        content: base64Data,
        mimeType: file.type,
        time: Date.now()
      });
    };
    reader.readAsDataURL(file);

    fileInput.value = "";
  } else if (text) {
    const msgRef = push(ref(db, "messages"));
    set(msgRef, {
      senderUid: currentUserUid,
      senderUsername: currentUsername,
      receiverUid: currentChatUid,
      receiverUsername: currentChatUsername,
      type: "text",
      content: text,
      time: Date.now()
    });
    messageInput.value = "";
  }
}

// ---- Event Listeners ----

// Handle form submit
messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  sendMessage(text, null);
});

// Auto-send when file is selected
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    sendMessage(null, file);
  }
});

// Drag & Drop support
messagesDiv.addEventListener("dragover", (e) => {
  e.preventDefault();
  messagesDiv.classList.add("dragover");
});

messagesDiv.addEventListener("dragleave", () => {
  messagesDiv.classList.remove("dragover");
});

messagesDiv.addEventListener("drop", (e) => {
  e.preventDefault();
  messagesDiv.classList.remove("dragover");

  if (!currentChatUid) {
    alert("Select a chat first");
    return;
  }

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    [...files].forEach((file) => {
      sendMessage(null, file);
    });
  }
});

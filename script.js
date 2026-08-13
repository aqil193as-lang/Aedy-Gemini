// script.js — AEDY GEMINI app logic
import {
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Wait a tick for firebase-config.js (loaded just before this module) to set window.__aedy
await new Promise((r) => setTimeout(r, 0));
const { auth, db, googleProvider } = window.__aedy;

/* ---------------------------------------------------------
   State
--------------------------------------------------------- */
const state = {
  user: null,
  chats: [],          // [{id, title, messages, updatedAt}]
  activeChatId: null,
  settings: { personality: "", aiName: "Aedy Gemini", theme: "dark" },
  streaming: false,
  abortController: null,
  unsubChats: null,
};

const PRESETS = {
  default: "You are Aedy Gemini, a helpful, sharp and friendly AI assistant built by Aedy. Answer clearly and concisely. Use Markdown and code blocks when useful.",
  witty: "You are Aedy Gemini. Be witty, blunt, and a little sarcastic — but always genuinely helpful underneath the humor. Never pad answers with fluff.",
  teacher: "You are Aedy Gemini, a patient and encouraging teacher. Break down concepts step by step, check for understanding, and use simple analogies. Be warm and never condescending.",
  coder: "You are Aedy Gemini, a senior software engineer. Give production-quality code, explain tradeoffs briefly, flag edge cases, and prefer showing code over long prose.",
  manglish: "You are Aedy Gemini, a friendly Malaysian buddy. Reply in casual Manglish (mix of Bahasa Malaysia and English) when the user does the same, and be relaxed, humble, and helpful — like chatting with a close friend.",
};

/* ---------------------------------------------------------
   DOM refs
--------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const bootScreen = $("boot-screen");
const landing = $("landing");
const appEl = $("app");
const signInBtn = $("google-signin-btn");
const landingError = $("landing-error");

const sidebar = $("sidebar");
const sidebarOverlay = $("sidebar-overlay");
const openSidebarBtn = $("open-sidebar-btn");
const closeSidebarBtn = $("close-sidebar-btn");
const newChatBtn = $("new-chat-btn");
const chatListEl = $("chat-list");
const searchInput = $("search-input");
const userAvatar = $("user-avatar");
const userName = $("user-name");

const messagesEl = $("messages");
const welcomeView = $("welcome-view");
const welcomeTitle = $("welcome-title");
const activeChatTitle = $("active-chat-title");
const composerInput = $("composer-input");
const sendBtn = $("send-btn");
const stopRow = $("stop-row");
const stopBtn = $("stop-btn");
const themeToggleBtn = $("theme-toggle-btn");

const settingsModal = $("settings-modal");
const settingsBtn = $("settings-btn");
const profileBtn = $("profile-btn");
const closeSettingsBtn = $("close-settings-btn");
const saveSettingsBtn = $("save-settings-btn");
const aiNameInput = $("ai-name-input");
const personalityInput = $("personality-input");
const settingsAvatar = $("settings-avatar");
const settingsName = $("settings-name");
const settingsEmail = $("settings-email");
const logoutBtn = $("logout-btn");

/* ---------------------------------------------------------
   Toast
--------------------------------------------------------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ---------------------------------------------------------
   Theme
--------------------------------------------------------- */
function applyTheme(theme) {
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : theme;
  document.documentElement.setAttribute("data-theme", resolved);
  document.querySelectorAll(".theme-opt").forEach((b) =>
    b.classList.toggle("active", b.dataset.theme === theme)
  );
}
themeToggleBtn.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  state.settings.theme = next;
  applyTheme(next);
  persistSettings();
});

/* ---------------------------------------------------------
   Auth
--------------------------------------------------------- */
signInBtn.addEventListener("click", async () => {
signInBtn.addEventListener("click", async () => {
  landingError.classList.add("hidden");
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    console.error(err);
    landingError.textContent = "DEBUG: " + (err.code || "") + " — " + (err.message || err);
    landingError.classList.remove("hidden");
  }
});

getRedirectResult(auth).catch((err) => {
  console.error("Redirect sign-in error:", err);
  landingError.textContent = "DEBUG: " + (err.code || "") + " — " + (err.message || err);
  landingError.classList.remove("hidden");
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  closeModal();
});

onAuthStateChanged(auth, async (user) => {
  bootScreen.classList.add("hidden");
  if (user) {
    state.user = user;
    landing.classList.add("hidden");
    appEl.classList.remove("hidden");
    userAvatar.src = user.photoURL || "";
    userName.textContent = user.displayName || user.email;
    settingsAvatar.src = user.photoURL || "";
    settingsName.textContent = user.displayName || "—";
    settingsEmail.textContent = user.email || "—";
    await loadSettings();
    subscribeChats();
  } else {
    state.user = null;
    if (state.unsubChats) state.unsubChats();
    appEl.classList.add("hidden");
    landing.classList.remove("hidden");
  }
});

/* ---------------------------------------------------------
   Settings (personality, name, theme) — stored per user
--------------------------------------------------------- */
function userDocRef() {
  return doc(db, "users", state.user.uid);
}

async function loadSettings() {
  try {
    const snap = await getDoc(userDocRef());
    if (snap.exists()) {
      state.settings = { ...state.settings, ...snap.data() };
    } else {
      await setDoc(userDocRef(), state.settings);
    }
  } catch (err) {
    console.warn("Could not load settings from Firestore, using local defaults.", err);
    const cached = localStorage.getItem("aedy_settings");
    if (cached) state.settings = { ...state.settings, ...JSON.parse(cached) };
  }
  applyTheme(state.settings.theme || "dark");
  aiNameInput.value = state.settings.aiName || "Aedy Gemini";
  personalityInput.value = state.settings.personality || "";
  welcomeTitle.innerHTML = `Hi, I'm ${escapeHtml(state.settings.aiName || "Aedy Gemini")}.<br/>How can I help you today?`;
  activeChatTitle.textContent = activeChatTitle.textContent; // no-op safety
}

async function persistSettings() {
  localStorage.setItem("aedy_settings", JSON.stringify(state.settings));
  if (!state.user) return;
  try {
    await setDoc(userDocRef(), state.settings, { merge: true });
  } catch (err) {
    console.warn("Failed to sync settings to Firestore", err);
  }
}

saveSettingsBtn.addEventListener("click", async () => {
  state.settings.aiName = aiNameInput.value.trim() || "Aedy Gemini";
  state.settings.personality = personalityInput.value.trim();
  await persistSettings();
  welcomeTitle.innerHTML = `Hi, I'm ${escapeHtml(state.settings.aiName)}.<br/>How can I help you today?`;
  toast("Settings saved");
  closeModal();
});

document.querySelectorAll(".preset-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    personalityInput.value = PRESETS[btn.dataset.preset] || "";
  });
});

document.querySelectorAll(".theme-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.settings.theme = btn.dataset.theme;
    applyTheme(btn.dataset.theme);
    persistSettings();
  });
});

/* ---------------------------------------------------------
   Modal (settings)
--------------------------------------------------------- */
function openModal(tab = "personality") {
  settingsModal.classList.remove("hidden");
  switchTab(tab);
}
function closeModal() {
  settingsModal.classList.add("hidden");
}
function switchTab(tab) {
  document.querySelectorAll(".modal-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
}
settingsBtn.addEventListener("click", () => openModal("personality"));
profileBtn.addEventListener("click", () => openModal("account"));
closeSettingsBtn.addEventListener("click", closeModal);
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) closeModal(); });
document.querySelectorAll(".modal-tab").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

/* ---------------------------------------------------------
   Sidebar (mobile)
--------------------------------------------------------- */
function openSidebar() { sidebar.classList.add("open"); sidebarOverlay.classList.add("open"); }
function closeSidebar() { sidebar.classList.remove("open"); sidebarOverlay.classList.remove("open"); }
openSidebarBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

/* ---------------------------------------------------------
   Chats — Firestore: users/{uid}/chats/{chatId}
--------------------------------------------------------- */
function chatsCol() {
  return collection(db, "users", state.user.uid, "chats");
}

function subscribeChats() {
  const q = query(chatsCol(), orderBy("updatedAt", "desc"));
  state.unsubChats = onSnapshot(q, (snap) => {
    state.chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderChatList();
    if (!state.activeChatId && state.chats.length) {
      // stay on welcome screen until user picks/creates a chat
    }
  }, (err) => {
    console.warn("Chat sync error", err);
  });
}

function renderChatList(filter = "") {
  const items = state.chats.filter((c) =>
    (c.title || "New chat").toLowerCase().includes(filter.toLowerCase())
  );
  chatListEl.innerHTML = "";
  if (!items.length) {
    chatListEl.innerHTML = `<p class="chat-empty">No chats yet</p>`;
    return;
  }
  for (const chat of items) {
    const row = document.createElement("div");
    row.className = "chat-item" + (chat.id === state.activeChatId ? " active" : "");
    row.innerHTML = `
      <span class="chat-item-title">${escapeHtml(chat.title || "New chat")}</span>
      <span class="chat-item-actions">
        <button data-action="rename" title="Rename">✎</button>
        <button data-action="delete" title="Delete">🗑</button>
      </span>`;
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return;
      openChat(chat.id);
      closeSidebar();
    });
    row.querySelector('[data-action="rename"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const newTitle = prompt("Rename chat", chat.title || "New chat");
      if (newTitle && newTitle.trim()) {
        await updateDoc(doc(db, "users", state.user.uid, "chats", chat.id), { title: newTitle.trim() });
      }
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Delete this chat? This can't be undone.")) {
        await deleteDoc(doc(db, "users", state.user.uid, "chats", chat.id));
        if (state.activeChatId === chat.id) startNewChat();
      }
    });
    chatListEl.appendChild(row);
  }
}

searchInput.addEventListener("input", () => renderChatList(searchInput.value));

function startNewChat() {
  state.activeChatId = null;
  activeChatTitle.textContent = "New chat";
  messagesEl.innerHTML = "";
  messagesEl.appendChild(welcomeView);
  welcomeView.classList.remove("hidden");
  renderChatList(searchInput.value);
}
newChatBtn.addEventListener("click", () => { startNewChat(); closeSidebar(); });

function openChat(chatId) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  state.activeChatId = chatId;
  activeChatTitle.textContent = chat.title || "New chat";
  messagesEl.innerHTML = "";
  welcomeView.classList.add("hidden");
  (chat.messages || []).forEach((m) => renderMessage(m.role, m.content, false));
  scrollToBottom();
  renderChatList(searchInput.value);
}

async function ensureActiveChat(firstMessage) {
  if (state.activeChatId) return state.activeChatId;
  const title = firstMessage.slice(0, 48) + (firstMessage.length > 48 ? "…" : "");
  const ref = await addDoc(chatsCol(), {
    title,
    messages: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  state.activeChatId = ref.id;
  activeChatTitle.textContent = title;
  return ref.id;
}

async function saveMessages(chatId, messages) {
  await updateDoc(doc(db, "users", state.user.uid, "chats", chatId), {
    messages,
    updatedAt: serverTimestamp(),
  });
}

/* ---------------------------------------------------------
   Rendering messages + markdown
--------------------------------------------------------- */
function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderMarkdown(text) {
  const html = window.marked ? window.marked.parse(text, { breaks: true }) : escapeHtml(text);
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  wrap.querySelectorAll("pre code").forEach((block) => {
    if (window.hljs) window.hljs.highlightElement(block);
    const pre = block.parentElement;
    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrap";
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    const btn = document.createElement("button");
    btn.className = "copy-code-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(block.textContent);
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });
    wrapper.appendChild(btn);
  });
  return wrap.innerHTML;
}

function renderMessage(role, content, animate = true) {
  welcomeView.classList.add("hidden");
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (role === "ai") {
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar ai";
    avatar.innerHTML = `<svg viewBox="0 0 100 100"><path d="M50 5 L61 39 L95 50 L61 61 L50 95 L39 61 L5 50 L39 39 Z" fill="url(#msgGrad)"/><defs><linearGradient id="msgGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#2DD4BF"/></linearGradient></defs></svg>`;
    row.appendChild(avatar);
  }

  bubble.innerHTML = renderMarkdown(content);
  row.appendChild(bubble);
  messagesEl.appendChild(row);

  if (role === "ai") {
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    actions.innerHTML = `<button data-act="copy">Copy</button><button data-act="regen">Regenerate</button>`;
    actions.querySelector('[data-act="copy"]').addEventListener("click", () => {
      navigator.clipboard.writeText(content);
      toast("Copied response");
    });
    actions.querySelector('[data-act="regen"]').addEventListener("click", () => regenerateLast());
    bubble.after(actions);
  }
  scrollToBottom();
  return bubble;
}

function renderTyping() {
  const row = document.createElement("div");
  row.className = "msg-row ai";
  row.id = "typing-row";
  row.innerHTML = `
    <div class="msg-avatar ai"><svg viewBox="0 0 100 100"><path d="M50 5 L61 39 L95 50 L61 61 L50 95 L39 61 L5 50 L39 39 Z" fill="url(#tGrad)"/><defs><linearGradient id="tGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#2DD4BF"/></linearGradient></defs></svg></div>
    <div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(row);
  scrollToBottom();
}
function removeTyping() {
  const el = $("typing-row");
  if (el) el.remove();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ---------------------------------------------------------
   Sending messages to Gemini via Netlify function
--------------------------------------------------------- */
let currentMessages = []; // in-memory mirror of active chat's messages

document.querySelectorAll(".suggestion-card").forEach((card) => {
  card.addEventListener("click", () => {
    composerInput.value = card.dataset.prompt;
    handleSend();
  });
});

composerInput.addEventListener("input", () => {
  composerInput.style.height = "auto";
  composerInput.style.height = Math.min(composerInput.scrollHeight, 200) + "px";
});
composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
sendBtn.addEventListener("click", handleSend);
stopBtn.addEventListener("click", () => {
  if (state.abortController) state.abortController.abort();
});

async function handleSend() {
  const text = composerInput.value.trim();
  if (!text || state.streaming) return;
  composerInput.value = "";
  composerInput.style.height = "auto";

  if (!state.activeChatId) {
    // load current messages fresh for a brand new chat
    currentMessages = [];
  } else {
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    currentMessages = chat ? [...(chat.messages || [])] : [];
  }

  renderMessage("user", text);
  currentMessages.push({ role: "user", content: text });

  await sendToGemini();
}

async function regenerateLast() {
  if (state.streaming || !currentMessages.length) return;
  // Drop the last AI reply if present, resend the last user message
  if (currentMessages[currentMessages.length - 1].role === "assistant") {
    currentMessages.pop();
  }
  // remove last ai bubble from DOM
  const rows = messagesEl.querySelectorAll(".msg-row.ai");
  if (rows.length) rows[rows.length - 1].remove();
  const prevActions = messagesEl.querySelectorAll(".msg-actions");
  if (prevActions.length) prevActions[prevActions.length - 1].remove();
  await sendToGemini();
}

async function sendToGemini() {
  state.streaming = true;
  sendBtn.disabled = true;
  stopRow.classList.remove("hidden");
  renderTyping();

  state.abortController = new AbortController();

  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: state.abortController.signal,
      body: JSON.stringify({
        messages: currentMessages,
        personality: state.settings.personality || undefined,
      }),
    });
    const data = await res.json();
    removeTyping();

    if (!res.ok) {
      renderMessage("ai", data.error || "Sorry, Aedy Gemini couldn't generate a response right now. Please try again.");
    } else {
      renderMessage("ai", data.reply);
      currentMessages.push({ role: "assistant", content: data.reply });

      const chatId = await ensureActiveChat(currentMessages[0].content);
      await saveMessages(chatId, currentMessages);
    }
  } catch (err) {
    removeTyping();
    if (err.name === "AbortError") {
      renderMessage("ai", "_Generation stopped._");
    } else {
      console.error(err);
      renderMessage("ai", "Sorry, Aedy Gemini couldn't generate a response right now. Please try again.");
    }
  } finally {
    state.streaming = false;
    sendBtn.disabled = false;
    stopRow.classList.add("hidden");
  }
}

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
(function initFromLocal() {
  const cached = localStorage.getItem("aedy_settings");
  if (cached) {
    try { state.settings = { ...state.settings, ...JSON.parse(cached) }; } catch {}
  }
  applyTheme(state.settings.theme || "dark");
})();

// Reveal landing once boot animation + auth check settle (fallback timeout)
setTimeout(() => {
  bootScreen.classList.add("hidden");
  if (!state.user) landing.classList.remove("hidden");
}, 1200);

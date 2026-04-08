const modeSelect = document.getElementById("modeSelect");
const statusPill = document.getElementById("statusPill");
const lessonPill = document.getElementById("lessonPill");
const responseText = document.getElementById("responseText");
const aiSubtext = document.getElementById("aiSubtext");

const micButton = document.getElementById("micButton");
const replayButton = document.getElementById("replayButton");
const sendButton = document.getElementById("sendButton");

const textInput = document.getElementById("textInput");
const conversationLog = document.getElementById("conversationLog");

const worksheetTopic = document.getElementById("worksheetTopic");
const worksheetInstruction = document.getElementById("worksheetInstruction");
const updateContextButton = document.getElementById("updateContextButton");

const quickReplyButtons = document.querySelectorAll(".chip");

/* =========================
   CONFIG
========================= */

// Do NOT expose real keys in production frontend.
// For MVP/demo only, you can test like this.
// Better approach later: route through your backend.

const GEMINI_API_KEY = "PASTE_YOUR_GEMINI_API_KEY_HERE";
const ELEVENLABS_API_KEY = "PASTE_YOUR_ELEVENLABS_API_KEY_HERE";
const ELEVENLABS_VOICE_ID = "PASTE_YOUR_ELEVENLABS_VOICE_ID_HERE";

const GEMINI_MODEL = "gemini-2.0-flash";

/* =========================
   STATE
========================= */

let currentMode = modeSelect.value;
let currentWorksheetContext = {
  topic: "",
  instruction: ""
};

let lastMayReply = "Hi Aya! Tap the microphone and tell me what you need help with.";
let isListening = false;
let isSpeaking = false;
let recognition = null;

/* =========================
   INIT
========================= */

function initApp() {
  updateModeLabel();
  setupSpeechRecognition();
  wireEvents();
}

function wireEvents() {
  modeSelect.addEventListener("change", handleModeChange);
  updateContextButton.addEventListener("click", handleContextUpdate);
  sendButton.addEventListener("click", handleTypedMessage);
  replayButton.addEventListener("click", replayLastReply);
  micButton.addEventListener("click", handleMicClick);

  quickReplyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = button.dataset.prompt;
      handleUserMessage(prompt, "quick-reply");
    });
  });

  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleTypedMessage();
    }
  });
}

/* =========================
   MODE / CONTEXT
========================= */

function handleModeChange() {
  currentMode = modeSelect.value;
  updateModeLabel();

  const subtextMap = {
    worksheet_helper: "I can help explain the worksheet step by step.",
    reading_buddy: "Let’s read together slowly and clearly.",
    math_buddy: "Let’s solve it one small step at a time.",
    encouragement_mode: "I’m here to cheer you on and help you keep going."
  };

  aiSubtext.textContent = subtextMap[currentMode] || "Let’s learn together.";
}

function updateModeLabel() {
  const modeMap = {
    worksheet_helper: "Worksheet Helper",
    reading_buddy: "Reading Buddy",
    math_buddy: "Math Buddy",
    encouragement_mode: "Encouragement Mode"
  };

  lessonPill.textContent = modeMap[currentMode] || "Worksheet Helper";
}

function handleContextUpdate() {
  currentWorksheetContext.topic = worksheetTopic.value.trim();
  currentWorksheetContext.instruction = worksheetInstruction.value.trim();

  appendLog(
    "May.AI",
    `Got it. I’ll stay focused on: ${
      currentWorksheetContext.topic || "the current lesson"
    }.`,
    "may"
  );

  setResponseText(
    `Okay! I will focus on ${currentWorksheetContext.topic || "your lesson"} and help one step at a time.`
  );
}

/* =========================
   VOICE INPUT
========================= */

function setupSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("Speech recognition is not supported in this browser.");
    micButton.disabled = true;
    micButton.querySelector(".mic-text").textContent = "Voice Not Supported";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    setListeningState();
  };

  recognition.onend = () => {
    isListening = false;
    clearListeningState();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    isListening = false;
    clearListeningState();
    setStatus("Voice error");
    setResponseText("I had trouble hearing that. Please try again.");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    handleUserMessage(transcript, "voice");
  };
}

function handleMicClick() {
  if (!recognition) {
    setResponseText("Voice input is not available in this browser.");
    return;
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  recognition.start();
}

function setListeningState() {
  setStatus("Listening...");
  statusPill.classList.add("listening");
  micButton.classList.add("mic-active");
  micButton.querySelector(".mic-text").textContent = "Listening...";
}

function clearListeningState() {
  setStatus("Ready");
  statusPill.classList.remove("listening");
  micButton.classList.remove("mic-active");
  micButton.querySelector(".mic-text").textContent = "Tap to Speak";
}

/* =========================
   USER MESSAGE FLOW
========================= */

function handleTypedMessage() {
  const message = textInput.value.trim();
  if (!message) return;

  handleUserMessage(message, "typed");
  textInput.value = "";
}

async function handleUserMessage(message, source = "typed") {
  if (!message) return;

  appendLog("Aya", message, "user");
  setStatus("Thinking...");
  setResponseText("Let me help with that...");

  try {
    const mayReply = await getMayAIReply(message);
    lastMayReply = mayReply;

    appendLog("May.AI", mayReply, "may");
    setResponseText(mayReply);

    await speakWithElevenLabs(mayReply);
  } catch (error) {
    console.error("Error handling message:", error);
    const fallbackReply =
      "I had a little problem just now. Please try again.";

    lastMayReply = fallbackReply;
    appendLog("May.AI", fallbackReply, "may");
    setResponseText(fallbackReply);
    setStatus("Ready");
  }
}

/* =========================
   PROMPT BUILDING
========================= */

function buildSystemPrompt() {
  return `
You are May.AI, Aya’s personal learning companion inside Aya’s Educational Worksheets.

Your role:
- Help a child learn in a calm, encouraging, safe, and simple way.
- You are not a general chatbot.
- You are a child-safe educational helper.

Rules:
1. Use short, simple sentences.
2. Give one step at a time.
3. Be warm, calm, and encouraging.
4. Prefer hints before full answers when appropriate.
5. Stay focused on learning.
6. Avoid mature, scary, violent, political, romantic, or inappropriate topics.
7. Do not ask for unnecessary personal information.
8. Keep replies good for voice playback.
9. Do not use jargon.
10. Keep replies brief, child-friendly, and clear.

Current mode: ${currentMode}

Worksheet topic: ${currentWorksheetContext.topic || "Not provided"}
Worksheet instruction: ${currentWorksheetContext.instruction || "Not provided"}

Return only the assistant reply text.
  `.trim();
}

/* =========================
   GEMINI CALL
========================= */

async function getMayAIReply(userMessage) {
  const systemPrompt = buildSystemPrompt();

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\nChild message: ${userMessage}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 32,
      topP: 0.95,
      maxOutputTokens: 120
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await response.json();

  const reply =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "Let’s try that one step at a time.";

  setStatus("Ready");
  return reply;
}

/* =========================
   ELEVENLABS TTS
========================= */

async function speakWithElevenLabs(text) {
  if (!text) return;

  try {
    isSpeaking = true;
    setSpeakingState();

    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${errorText}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    audio.onended = () => {
      isSpeaking = false;
      clearSpeakingState();
      URL.revokeObjectURL(audioUrl);
    };

    audio.onerror = () => {
      isSpeaking = false;
      clearSpeakingState();
      URL.revokeObjectURL(audioUrl);
    };

    await audio.play();
  } catch (error) {
    console.error("ElevenLabs playback error:", error);
    isSpeaking = false;
    clearSpeakingState();
  }
}

async function replayLastReply() {
  if (!lastMayReply) return;
  await speakWithElevenLabs(lastMayReply);
}

function setSpeakingState() {
  setStatus("Speaking...");
  statusPill.classList.add("speaking");
}

function clearSpeakingState() {
  setStatus("Ready");
  statusPill.classList.remove("speaking");
}

/* =========================
   UI HELPERS
========================= */

function setStatus(text) {
  statusPill.textContent = text;
}

function setResponseText(text) {
  responseText.textContent = text;
}

function appendLog(role, message, type) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;

  const roleEl = document.createElement("span");
  roleEl.className = "log-role";
  roleEl.textContent = role;

  const messageEl = document.createElement("p");
  messageEl.textContent = message;

  entry.appendChild(roleEl);
  entry.appendChild(messageEl);
  conversationLog.appendChild(entry);
  conversationLog.scrollTop = conversationLog.scrollHeight;
}

/* =========================
   START
========================= */

initApp();

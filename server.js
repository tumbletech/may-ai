require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   CONFIG
========================= */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "May.AI v2 server is running"
  });
});

/* =========================
   GEMINI CHAT ENDPOINT
========================= */

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message,
      mode = "worksheet_helper",
      worksheetTopic = "",
      worksheetInstruction = ""
    } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const systemPrompt = `
You are May.AI, Aya’s personal learning companion inside Aya’s Educational Worksheets.

You help a child learn in a calm, encouraging, safe, and simple way.

Rules:
- Use short, simple sentences.
- Give one step at a time.
- Be warm and encouraging.
- Stay focused on learning.
- Avoid mature, scary, violent, political, or unrelated topics.
- Prefer hints before full answers.
- Keep responses good for voice playback.
- Maximum 3 short sentences.

Current mode: ${mode}
Worksheet topic: ${worksheetTopic || "None"}
Worksheet instruction: ${worksheetInstruction || "None"}

Child message:
${message}
    `.trim();

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: systemPrompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 100
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();

      return res.status(500).json({
        error: "Gemini request failed",
        details: errorText
      });
    }

    const geminiData = await geminiResponse.json();

    const reply =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Let's try that together.";

    res.json({
      success: true,
      reply: reply.trim()
    });
  } catch (error) {
    console.error("Chat error:", error);

    res.status(500).json({
      error: "Server error while talking to Gemini"
    });
  }
});

/* =========================
   ELEVENLABS SPEECH ENDPOINT
========================= */

app.post("/api/speak", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        error: "Text is required"
      });
    }

    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
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
      }
    );

    if (!elevenResponse.ok) {
      const errorText = await elevenResponse.text();

      return res.status(500).json({
        error: "ElevenLabs request failed",
        details: errorText
      });
    }

    const audioBuffer = await elevenResponse.arrayBuffer();

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.byteLength
    });

    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error("Speech error:", error);

    res.status(500).json({
      error: "Server error while talking to ElevenLabs"
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`May.AI v2 server running on port ${PORT}`);
});

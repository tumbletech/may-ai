require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

const PORT = process.env.PORT || 3000;

// The System Identity for May.AI
const MAY_AI_IDENTITY = `
  Your name is May.AI. You are a kind, joyful, and patient AI friend for a 7-year-old girl named Aya. 
  Aya is a child with special needs, so your language should be simple, encouraging, and very clear.
  - Never use long words or complex sentences.
  - Always be supportive and positive.
  - Keep responses to 1 or 2 short sentences.
  - If she says something unclear, gently ask her to tell you again.
`;

app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;

        // 1. Get Text Response from Gemini 1.5 Flash
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const geminiResponse = await axios.post(geminiUrl, {
            contents: [{
                parts: [{ 
                    text: `${MAY_AI_IDENTITY}\n\nAya says: "${message}"` 
                }]
            }]
        });

        const aiText = geminiResponse.data.candidates[0].content.parts[0].text;

        // 2. Convert to Speech with ElevenLabs
        const ttsResponse = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.VOICE_ID}`,
            data: {
                text: aiText,
                model_id: "eleven_monolingual_v1",
                voice_settings: { 
                    stability: 0.8, 
                    similarity_boost: 0.75, // Higher similarity for a more distinct personality
                    style: 0.0,
                    use_speaker_boost: true
                }
            },
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
        });

        // 3. Return the audio stream
        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(ttsResponse.data, 'binary'));

    } catch (error) {
        console.error('May.AI Error:', error.response ? error.response.data.toString() : error.message);
        res.status(500).send('May.AI is taking a little nap. Try again soon!');
    }
});

app.listen(PORT, () => console.log(`May.AI is now listening for Aya on http://localhost:${PORT}`));

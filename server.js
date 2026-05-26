require('dotenv').config();

// server.js
// Phase 4: Integrate Google Gemini via @google/genai

const path = require('path');
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Environment / SDK initialization ---
if (!process.env.GEMINI_API_KEY) {
  console.warn('\n*******************************************************');
  console.warn('WARNING: GEMINI_API_KEY is not set in environment variables.');
  console.warn('Please set GEMINI_API_KEY to a valid Google Cloud/GenAI API key before running in production.');
  console.warn('Example (Linux/macOS): export GEMINI_API_KEY=your_key_here');
  console.warn('Example (Windows PowerShell): $env:GEMINI_API_KEY = "your_key_here"');
  console.warn('*******************************************************\n');
}

// Initialize the Google GenAI client using the API key from environment
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Serve static files from the project root so index.html is available
app.use(express.static(path.join(__dirname)));

// --- POST /api/forecast ---
// This endpoint proxies the user's prompt to a Gemini model and returns
// a strict JSON structure suitable for charting on the frontend.
app.post('/api/forecast', async (req, res) => {
  const { prompt } = req.body || {};

  // Basic validation
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, error: 'Missing or invalid "prompt" in request body.' });
  }

  console.log(`Received prompt: ${prompt}`);

  try {
    // Call Gemini via the SDK using the correct `contents` and `config` shape for the @google/genai package
    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      // Fix: wrap the text parameter correctly for the SDK
      contents: [
        {
          role: 'user',
          parts: [{ text: `Analyze this market scenario and generate a realistic 6-month prediction array: ${prompt}` }]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            summary: { type: 'STRING' },
            labels: { type: 'ARRAY', items: { type: 'STRING' } },
            values: { type: 'ARRAY', items: { type: 'NUMBER' } }
          },
          required: ['summary', 'labels', 'values']
        },
        systemInstruction: "You are an expert corporate forecasting engine. Generate a realistic 6-month data trend line. Return an array of exactly 6 numbers for 'values' and an array of 6 months ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] for 'labels'."
      }
    });

    // The SDK's response shape can vary. Extract raw text from the candidates array returned by the SDK.
    let parsed = null;

    try {
      // Safely drill into the expected SDK structure where the model's candidate text is located
      const rawText = aiResponse && aiResponse.candidates && aiResponse.candidates[0] && aiResponse.candidates[0].content && aiResponse.candidates[0].content.parts && aiResponse.candidates[0].content.parts[0] && aiResponse.candidates[0].content.parts[0].text;

      if (!rawText) {
        console.warn('AI response did not contain expected candidates content; full aiResponse:', JSON.stringify(aiResponse));
        return res.status(502).json({ success: false, error: 'AI returned an unexpected response format.' });
      }

      // Clean the returned text in case the model wrapped JSON in markdown fences
      let cleanText = rawText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/```json|```/g, '').trim();
      }

      console.log('🚀 Extracted AI JSON Text:', cleanText);

      // Parse the cleaned JSON text
      parsed = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error('Error parsing AI JSON output:', parseErr);
      return res.status(502).json({ success: false, error: 'Failed to parse AI JSON response.' });
    }

    // Basic schema validation (defensive)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.labels) || !Array.isArray(parsed.values) || typeof parsed.summary !== 'string') {
      console.error('Parsed AI output failed basic validation:', parsed);
      return res.status(502).json({ success: false, error: 'AI returned invalid structured data.' });
    }

    // Ensure exactly 6 labels & values
    if (parsed.labels.length !== 6 || parsed.values.length !== 6) {
      console.warn('AI returned arrays with unexpected length. labels:', parsed.labels, 'values:', parsed.values);
      // Optionally pad or trim to 6. Here we will trim/pad conservatively.
      const labels = parsed.labels.slice(0, 6);
      while (labels.length < 6) labels.push(`M${labels.length + 1}`);
      const values = parsed.values.slice(0, 6).map(v => Number(v));
      while (values.length < 6) values.push(0);

      parsed.labels = labels;
      parsed.values = values;
    }

    // Final structured response
    const responsePayload = {
      success: true,
      modelUsed: 'gemini-2.5-flash',
      summary: parsed.summary,
      labels: parsed.labels,
      values: parsed.values
    };

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('Error during AI generation:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate forecast.' });
  }
});

// Ensure root serves the index.html file (in case static middleware didn't handle it)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Forecasting Wizard server listening on http://localhost:${PORT}`);
});

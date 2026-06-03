require('dotenv').config();

// server.js — Robust Express server for Forecasting Wizard (with pagination & soft-delete)
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenAI } = require('@google/genai');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Basic middleware ---
app.use(cors());
app.use(express.json({ limit: '200kb' }));

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root route: always serve the home page (index.html)
// This prevents accidental redirects or fallbacks to dashboard when visiting '/'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Safe process handlers ---
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });

// --- MongoDB connection ---
const MONGO_URI = process.env.MONGO_URI || '';
async function connectDB() {
  if (!MONGO_URI) { console.warn('MONGO_URI not provided; DB persistence will be disabled.'); return; }
  try { await mongoose.connect(MONGO_URI); console.log('MongoDB connected'); } catch (err) { console.error('MongoDB connection failed:', err); }
}
connectDB();

// --- Forecast Schema & Model (RESTORED: no deletedAt) ---
const forecastSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  summary: { type: String },
  labels: [{ type: String }],
  values: [{ type: Number }],
  createdAt: { type: Date, default: Date.now }
});
const Forecast = mongoose.models.Forecast || mongoose.model('Forecast', forecastSchema);

// --- Google Gemini SDK init ---
let ai = null;
if (!process.env.GEMINI_API_KEY) console.warn('GEMINI_API_KEY not set; AI calls may fail.');
try { ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); console.log('Google GenAI client initialized'); } catch (err) { console.error('Failed to initialize Google GenAI client:', err); }

// --- Healthcheck ---
app.get('/healthz', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- Helper: safe JSON parse ---
function safeJsonParse(text) { try { return JSON.parse(text); } catch (e) { return null; } }

// --- Helper: extract operational parameters from user prompt ---
/**
 * Advanced semantic parameter extraction with dynamic number discovery.
 * Extracts ALL numerical values from user query and maps them to model parameters
 * based on contextual keywords.
 */
function extractParametersFromPrompt(prompt) {
  try {
    const p = String(prompt).toLowerCase().trim();
    const results = {
      demand: 50,
      risk: 30,
      timeline: 6,
      horizon: 6,
      limit: 10,
      threshold: 0.5,
      steps: 4,
      anomalies: 0,
      rawNumbers: [] // Track all extracted numbers for logging/debugging
    };

    // --- Phase 1: Extract ALL numerical values from text ---
    // Pattern matches: integers, floats, percentages, numbers with units
    const numberPatterns = [
      /(\d+\.?\d*)\s*(days?|weeks?|months?|quarters?|years?|steps?|horizon|window)/gi,
      /(\d+\.?\d*)\s*(?:percent|%|anomalies?|top|limit|threshold)/gi,
      /(?:next|for|over|within|last|across|top|limit|threshold)?\s*(\d+\.?\d*)/gi,
      /(\d+\.?\d*)\s*(?:units?|values?|points?|metrics?)/gi
    ];

    const extractedNumbers = [];
    
    numberPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(p)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num) && num >= 0) {
          extractedNumbers.push({
            value: num,
            context: match[0],
            fullMatch: match[0]
          });
        }
      }
    });

    // Remove duplicates, keep unique values
    const uniqueNumbers = [];
    const seen = new Set();
    extractedNumbers.forEach(item => {
      if (!seen.has(item.value)) {
        seen.add(item.value);
        uniqueNumbers.push(item);
      }
    });

    results.rawNumbers = uniqueNumbers.map(n => n.value);

    // --- Phase 2: Context-aware parameter mapping ---
    
    // Map to DEMAND (0-100): keywords like "demand", "market", "sales", "volume"
    const demandKeywords = /demand|market\s+(?:demand|volume|size)|sales|volume|quantity/i;
    const demandMatch = p.match(new RegExp(`(${demandKeywords.source})\\s+(\\d+\\.?\\d*)`));
    if (demandMatch) {
      const val = parseFloat(demandMatch[2]);
      results.demand = !isNaN(val) ? Math.min(100, Math.max(0, Math.round(val))) : results.demand;
    } else if (uniqueNumbers.length > 0) {
      // Fallback: first extracted number might be demand if no demand keyword found
      const firstNum = uniqueNumbers[0].value;
      if (firstNum <= 100 && !p.includes('horizon') && !p.includes('anomal')) {
        results.demand = Math.round(firstNum);
      }
    }

    // Map to RISK (0-100): keywords like "risk", "disruption", "uncertainty"
    const riskKeywords = /risk|disruption|uncertainty|volatility|variance/i;
    const riskMatch = p.match(new RegExp(`(${riskKeywords.source})\\s+(\\d+\\.?\\d*)`));
    if (riskMatch) {
      const val = parseFloat(riskMatch[2]);
      results.risk = !isNaN(val) ? Math.min(100, Math.max(0, Math.round(val))) : results.risk;
    }

    // Map to TIMELINE/HORIZON (1-12 months): keywords like "months", "quarters", "weeks", "days"
    const timelineKeywords = /(\d+)\s*(days?|weeks?|months?|quarters?|years?|horizon|window|period)/i;
    const timelineMatch = p.match(timelineKeywords);
    if (timelineMatch) {
      let val = parseInt(timelineMatch[1]);
      const unit = timelineMatch[2].toLowerCase();
      
      // Convert to months for normalization
      if (unit.includes('quarter')) val = val * 3;
      else if (unit.includes('year')) val = val * 12;
      else if (unit.includes('week')) val = Math.ceil(val / 4);
      else if (unit.includes('day')) val = Math.ceil(val / 30);
      // else: already in months or is 'horizon'/'window'/'period' (treat as months)
      
      results.timeline = Math.min(12, Math.max(1, Math.round(val)));
      results.horizon = results.timeline;
    }

    // Map to LIMIT (anomalies, outliers, etc.): keywords like "top", "limit", "anomalies"
    const limitKeywords = /(?:top|analyze|detect|find)?\s*(\d+)\s*(?:anomalies?|outliers?|events?|limit)/i;
    const limitMatch = p.match(limitKeywords);
    if (limitMatch) {
      const val = parseInt(limitMatch[1]);
      results.limit = !isNaN(val) ? Math.max(1, Math.min(1000, val)) : results.limit;
      results.anomalies = results.limit; // For compatibility
    }

    // Map to THRESHOLD (0.0-1.0): keywords like "threshold", "confidence", "above"
    const thresholdKeywords = /threshold\s+(\d+\.?\d*)|confidence\s+(\d+\.?\d*)|above\s+(\d+\.?\d*)/i;
    const thresholdMatch = p.match(thresholdKeywords);
    if (thresholdMatch) {
      let val = parseFloat(thresholdMatch[1] || thresholdMatch[2] || thresholdMatch[3]);
      // If value > 1, assume it's a percentage (0-100 range) and convert to decimal
      if (!isNaN(val)) {
        if (val > 1) val = val / 100;
        results.threshold = Math.min(1.0, Math.max(0.0, val));
      }
    }

    // Map to STEPS: keywords like "steps", "intervals", "windows"
    const stepsKeywords = /(\d+)\s*(?:steps?|intervals?|windows?|forecasts?)/i;
    const stepsMatch = p.match(stepsKeywords);
    if (stepsMatch) {
      const val = parseInt(stepsMatch[1]);
      results.steps = !isNaN(val) ? Math.max(1, Math.min(24, val)) : results.steps;
    }

    // --- Phase 3: Type casting and validation ---
    results.demand = Math.round(results.demand);
    results.risk = Math.round(results.risk);
    results.timeline = Math.round(results.timeline);
    results.horizon = Math.round(results.horizon);
    results.limit = Math.round(results.limit);
    results.threshold = parseFloat(results.threshold.toFixed(2));
    results.steps = Math.round(results.steps);
    results.anomalies = Math.round(results.anomalies);

    console.log(`[PARSER] Input: "${prompt}"`);
    console.log(`[PARSER] Extracted numbers: ${results.rawNumbers.join(', ') || 'none'}`);
    console.log(`[PARSER] Mapped parameters: demand=${results.demand}, risk=${results.risk}, horizon=${results.horizon}, limit=${results.limit}, threshold=${results.threshold}`);

    return results;
  } catch (e) {
    console.error('[PARSER] Error during extraction:', e.message);
    // Fallback defaults if parsing fails
    return {
      demand: 50,
      risk: 30,
      timeline: 6,
      horizon: 6,
      limit: 10,
      threshold: 0.5,
      steps: 4,
      anomalies: 0,
      rawNumbers: []
    };
  }
}

// --- Helper: safe JSON parse ---
function safeJsonParse(text) { try { return JSON.parse(text); } catch (e) { return null; } }

// --- Helper: safe semantic text parsing ---
function parsePromptSafely(input) {
  try {
    if (typeof input !== 'string') return '';
    const normalized = String(input).trim().toLowerCase().slice(0, 500);
    const cleaned = normalized.replace(/[^a-z0-9\s]/g, ' ');
    return cleaned.split(/\s+/).filter(w => w.length > 0).join(' ');
  } catch (e) {
    console.warn('Semantic text parsing failed:', e);
    return '';
  }
}

// --- Helper: validate and coerce numeric input ---
function safeNumeric(value, fallback) {
  try {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  } catch (e) {
    return fallback;
  }
}

// --- POST /api/forecast --- Dynamic ML pipeline with semantic parameter extraction
app.post('/api/forecast', async (req, res) => {
  const fallbackResult = {
    barValues: [0.4, 0.5, 0.55, 0.6],
    radarValues: [50.0, 40.0, 45.0, 50.0]
  };

  try {
    const prompt = (req.body && req.body.prompt) ? String(req.body.prompt).trim() : '';
    
    // Extract ALL parameters from user prompt using advanced semantic analysis
    const params = extractParametersFromPrompt(prompt);

    console.log('Forecast request — prompt:', prompt);
    console.log(`  Extracted parameters: demand=${params.demand}, risk=${params.risk}, horizon=${params.horizon}, limit=${params.limit}, threshold=${params.threshold}, steps=${params.steps}`);
    console.log(`  Raw numbers found: [${params.rawNumbers.join(', ')}]`);

    const pythonCmd = process.platform === 'win32' ? 'py' : 'python';
    
    // Pass all extracted parameters to Python as JSON for flexibility
    // This allows Python to use any parameter it needs
    const paramPayload = JSON.stringify({
      prompt: prompt,
      demand: params.demand,
      risk: params.risk,
      timeline: params.timeline,
      horizon: params.horizon,
      limit: params.limit,
      threshold: params.threshold,
      steps: params.steps,
      anomalies: params.anomalies
    });

    const args = ['predict.py', paramPayload];
    const childProcess = require('child_process').spawn(pythonCmd, args, { cwd: __dirname });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let responded = false;
    let timeout = null;

    // Set 10-second timeout for Python process
    timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        childProcess.kill();
        console.warn('[TIMEOUT] Python process exceeded 10 seconds');
        return res.json(fallbackResult);
      }
    }, 10000);

    childProcess.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
    });

    childProcess.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
    });

    childProcess.on('error', (processError) => {
      console.error('[SPAWN ERROR] Python process failed to start:', processError);
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        return res.status(500).json(fallbackResult);
      }
    });

    childProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      if (stderrBuffer) {
        console.warn('[STDERR]', stderrBuffer.slice(0, 1000));
      }

      if (responded) return;

      let parsedResult = null;
      try {
        parsedResult = JSON.parse(stdoutBuffer.trim());
      } catch (parseError) {
        console.error('[JSON PARSE ERROR]', parseError.message);
        console.error('[RAW OUTPUT]', stdoutBuffer.slice(0, 500));
      }

      if (!parsedResult || !Array.isArray(parsedResult.barValues) || !Array.isArray(parsedResult.radarValues)) {
        responded = true;
        console.warn('[VALIDATION FAILED] Missing or invalid barValues/radarValues, using fallback');
        return res.json(fallbackResult);
      }

      responded = true;
      console.log('[SUCCESS] Forecast generated:', { 
        barValues: parsedResult.barValues.length, 
        radarValues: parsedResult.radarValues.length 
      });
      return res.json({
  ...parsedResult,
  params: params
});
    });
  } catch (err) {
    console.error('[SERVER ERROR] in /api/forecast:', err.message);
    return res.status(500).json(fallbackResult);
  }
});

// --- GET /api/forecasts ---
// RESTORE: return all documents (no pagination, no deletedAt filter)
app.get('/api/forecasts', async (req, res) => {
  try {
    const docs = await Forecast.find().sort({ createdAt: -1 }).lean().exec();
    return res.json(docs);
  } catch (err) {
    console.error('Error fetching forecasts:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch forecasts' });
  }
});

// --- GET /api/history ---
// Alias for the forecasts collection so the frontend can use a stable history endpoint.
app.get('/api/history', async (req, res) => {
  try {
    const docs = await Forecast.find().sort({ createdAt: -1 }).lean().exec();
    return res.json(docs);
  } catch (err) {
    console.error('Error fetching history:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// --- DELETE /api/forecasts/:id ---
// RESTORE: permanent delete
app.delete('/api/forecasts/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });

  try {
    const result = await Forecast.findByIdAndDelete(id).exec();
    if (!result) return res.status(404).json({ success: false, error: 'Forecast not found' });
    console.log('Deleted forecast id=', id);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting forecast:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete forecast' });
  }
});

// Note: static middleware serves files from /public (index.html, dashboard.html, history.html, etc.)

app.listen(PORT, () => console.log(`Forecasting Wizard server running on http://localhost:${PORT}`));
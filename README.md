# Forecasting Wizard

### Cost-Optimized Demand Forecasting & Market Intelligence System

Forecasting Wizard is a full-stack predictive analytics system designed to simulate real-world demand forecasting pipelines while aggressively minimizing API and compute cost.

The system integrates a lightweight frontend dashboard, a Node.js orchestration layer, and a Python-based machine learning engine, enhanced by a token-efficient Gemini API middleware.

---

## Project Highlights

* Designed a cost-optimized AI pipeline reducing API token usage by approximately 80–90% using compressed response schemas
* Built a full-stack system integrating frontend, backend, and machine learning components
* Implemented real-time forecasting using a dual-dataset architecture combining historical and exogenous variables
* Eliminated redundant API calls through client-side caching, improving performance and reducing operational cost
* Engineered a Node-to-Python execution pipeline for scalable ML inference

---

## System Architecture

```text
Frontend (HTML, JS)
   │
   ├── SessionStorage Cache (Zero Redundant Calls)
   │
Backend (Node.js / Express)
   │
   ├── Gemini Middleware (Token-Optimized Parsing Layer)
   │         └── Micro JSON Output
   │
   └── Python ML Engine (Subprocess)
             └── Dual Dataset Processing
```

---

## Tech Stack

Frontend:

* HTML5, CSS3, Vanilla JavaScript
* Chart.js / ApexCharts

Backend:

* Node.js, Express.js
* dotenv

AI Layer:

* Gemini API (gemini-1.5-flash)
* Custom token-optimization middleware

Machine Learning:

* Python, pandas, numpy, scikit-learn

---

## Key Engineering Features

### 1. Token-Optimized AI Middleware

* Designed a micro-response schema to minimize API payload size:

```json
{"d": 50, "s": 30, "m": 12}
```

* Eliminates verbose outputs (no markdown, explanations, or formatting)
* Reduces API cost while maintaining semantic accuracy
* Acts as a lightweight NLP proxy layer

---

### 2. Dual-Dataset Forecasting Pipeline

* Integrated:

  * Historical dataset for baseline trends
  * Market dataset for external influencing factors

* Implemented:

  * Dynamic dataset merging using pandas
  * Real-time vector generation for charts
  * Clean subprocess execution to ensure stable backend communication

---

### 3. Frontend Performance Optimization

* Implemented sessionStorage-based caching layer
* Prevents duplicate API calls across navigation
* Enables instant dashboard rendering without backend interaction

---

## Project Structure

```text
├── server.js
├── predict.py
├── dataset_1.csv
├── dataset_2.csv
├── .env
└── public/
    ├── index.html
    ├── dashboard.html
    ├── history.html
    └── js/main.js
```

---

## Setup Instructions

### Prerequisites

* Node.js (v16+)
* Python (v3.8+)

### Installation

```bash
npm install express dotenv
pip install pandas numpy scikit-learn
```

### Environment Configuration

```
PORT=3000
GEMINI_API_KEY=your_api_key_here
```

### Run

```bash
node server.js
```

Access the app at:

```
http://localhost:3000
```

---

## Current Status

Completed:

* Full-stack integration (Frontend + Backend + ML)
* Token-optimized AI middleware
* Node-to-Python execution pipeline
* Frontend caching system

In Progress:

* Chart scaling optimization
* Persistent storage for history

---

## Future Enhancements

* Database integration (MongoDB / SQLite)
* Advanced anomaly detection models
* User authentication and session management
* Cloud deployment (Vercel, Render, Railway)

---

## Key Takeaways

This project demonstrates:

* Practical system design for AI-powered applications
* Cost-aware engineering and optimization strategies
* Integration of machine learning into production pipelines
* Strong full-stack development capability

---

## Author

Aditya Mhetre

---


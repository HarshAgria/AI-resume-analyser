# 🤖 AI Resume Analyzer — AI Hiring Copilot

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react\&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite\&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js\&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss\&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?logo=docker\&logoColor=white)
![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector_DB-FF6B35)
![Google Gemini](https://img.shields.io/badge/Google_Gemini-Generative_AI-4285F4)
![Cloudinary](https://img.shields.io/badge/Cloudinary-Media_Storage-3448C5?logo=cloudinary\&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Tool_Orchestration-111827)
![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?logo=vercel\&logoColor=white)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render\&logoColor=white)

An AI-powered **resume intelligence and job-matching platform** that evaluates a candidate's resume against a supplied job description using **requirement-centric RAG, semantic retrieval, deterministic evidence validation, and Google Gemini**.

Unlike a keyword-only ATS checker, the system decomposes a job description into structured requirements, retrieves relevant evidence from the candidate's resume for each requirement, validates explicit evidence, and produces a transparent weighted match score.

The platform is designed to remain **domain-agnostic** — the same pipeline can evaluate resumes for software engineering, finance, healthcare, sales, marketing, legal, education, and other professional roles without relying on hard-coded profession-specific rules.

---

# 🌐 Live Application

### 🚀 Live Demo

[AI Resume Analyzer](https://ai-resume-analyser-eta-five.vercel.app/)

### ❤️ API Health

[Backend Health Check](https://resume-analyzer-backend-fzl4.onrender.com/api/health/)

---

# ✨ Core Features

## 📄 AI Resume Analysis

Upload a resume and receive a structured recruiter-style evaluation covering:

* ATS compatibility
* Resume quality
* Strengths
* Improvement recommendations
* Missing or weak evidence
* Candidate summary
* Target-role alignment
* Job description match
* Recommended roles
* Skill and experience gaps

---

## 🎯 Universal Job Description Matching

The analyzer is designed to work with **arbitrary job descriptions**, rather than being limited to software engineering roles.

Examples include:

* Software Engineer
* Data Analyst
* Financial Analyst
* Product Manager
* Sales Manager
* Marketing Specialist
* Healthcare Professional
* Legal Associate
* Operations Manager
* Researcher

The system extracts requirements dynamically from the supplied job description instead of relying on a predefined technology or profession dictionary.

---

# 🧠 Requirement-Centric RAG

The core of the system uses a **requirement-centric Retrieval-Augmented Generation (RAG)** architecture.

Instead of embedding the entire job description as one document, the system:

```text
Job Description
       │
       ▼
Requirement Extraction
       │
       ▼
Structured Requirements
       │
       ├── Skills
       ├── Experience
       ├── Education
       ├── Certifications
       ├── Responsibilities
       ├── Domain Knowledge
       ├── Languages
       ├── Location
       ├── Work Authorization
       └── Other Requirements
       │
       ▼
Each Requirement Embedded Individually
       │
       ▼
Resume Evidence Retrieval
       │
       ▼
Semantic + Lexical Validation
       │
       ▼
Evidence Status
       │
       ▼
Weighted JD Match Score
```

This allows the system to answer a more useful question:

> **"What evidence in this resume supports each individual requirement?"**

rather than simply calculating similarity between two large blocks of text.

---

# 🔎 Hybrid Evidence Matching

The matching engine combines multiple forms of evidence.

### 1. Semantic Retrieval

Resume evidence is retrieved using vector similarity through **ChromaDB**.

This allows conceptually related experience to be discovered even when the wording is different.

For example:

```text
JD:
"Debug network packet-level communication issues"

Resume:
"Analyzed SIP/RTP traffic using Wireshark to diagnose
call establishment and media issues."
```

Semantic retrieval can identify the relationship between the requirement and the resume evidence.

---

### 2. Explicit Evidence Validation

Semantic similarity alone is not treated as proof.

The system also checks for explicit evidence within the resume using deterministic validation.

Examples:

```text
C++
Python
Wireshark
B.Tech
Bachelor's degree
5 years experience
AWS Certified
```

This reduces false positives caused by semantic similarity.

---

### 3. Evidence Strength

Requirements are classified into evidence states such as:

| Status           | Meaning                               |
| ---------------- | ------------------------------------- |
| `strong_match`   | Clear supporting evidence exists      |
| `possible_match` | Partial or weaker supporting evidence |
| `missing`        | No sufficient supporting evidence     |

This evidence layer is then used by the deterministic scoring engine.

---

# 📊 Deterministic JD Match Scoring

The numerical job-match score is calculated independently from the generative AI layer.

Requirements receive weights based on their importance.

Conceptually:

```text
Strong Match   → 1.0
Possible Match → 0.5
Missing        → 0.0
```

The weighted score is calculated from the complete requirement set:

```text
JD Match Score =
Σ(requirement weight × evidence value)
─────────────────────────────────── × 100
       Σ(requirement weights)
```

This creates a transparent scoring layer where the LLM does **not** arbitrarily decide the final numerical match score.

---

# 🔀 Logical Requirement Handling

Real-world job descriptions frequently contain logical requirements.

For example:

```text
MS + 0–2 years OR BS + 1–3 years
```

The analyzer models these relationships rather than treating the entire sentence as a single keyword.

The system can evaluate structured alternatives such as:

```text
Alternative A
Master's degree + 0–2 years

OR

Alternative B
Bachelor's degree + 1–3 years
```

This allows the matcher to correctly evaluate compound requirements while remaining domain-agnostic.

---

# 🤖 Google Gemini AI

Google Gemini is used for generative reasoning and structured analysis.

The AI layer provides:

* Recruiter-style explanations
* Resume summaries
* Strength analysis
* Improvement recommendations
* Skill-gap explanations
* Role recommendations
* Structured JSON output

The generative layer is intentionally separated from deterministic matching.

### Architecture principle

```text
Deterministic Engine
        │
        ├── Requirement Status
        ├── Evidence
        └── JD Match Score
                 │
                 ▼
           Gemini AI
                 │
                 ├── Explanation
                 ├── Recommendations
                 └── Candidate Insights
```

Gemini explains the evidence rather than overriding the underlying deterministic score.

---

# 🧩 MCP Tool Orchestration

The backend uses **Model Context Protocol (MCP)** to orchestrate AI/RAG-related tools.

The architecture separates individual capabilities into tools such as:

```text
Requirement Extraction
        │
Resume Embedding
        │
Job Description Embedding
        │
Resume Evidence Retrieval
        │
AI Analysis
```

This creates a modular tool-oriented architecture where individual AI capabilities can evolve independently.

---

# 🏗 System Architecture

```text
                         ┌─────────────────────┐
                         │        User         │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ React + Tailwind UI │
                         └──────────┬──────────┘
                                    │
                                  Axios
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Express REST API  │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
             Resume Processing              JD Processing
                     │                             │
                     ▼                             ▼
             Resume Evidence              Requirement Extraction
                     │                             │
                     └──────────────┬──────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    MCP Tool Layer   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      ChromaDB       │
                         │    Vector Search    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         Semantic + Lexical
                              Validation
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Deterministic Match │
                         │      Engine         │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Google Gemini    │
                         │ AI Explanation Layer │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Interactive Results │
                         │      Dashboard      │
                         └─────────────────────┘
```

---

# 🔄 Processing Pipeline

### Step 1 — Resume Upload

The user uploads a resume PDF.

### Step 2 — Resume Processing

The backend extracts the resume's textual content and prepares candidate evidence.

### Step 3 — Secure Storage

The uploaded document can be stored through Cloudinary with deletion support.

### Step 4 — Job Description Processing

The supplied job description is passed through requirement extraction.

### Step 5 — Requirement Structuring

The system converts the JD into structured requirements containing information such as:

```text
Requirement
Category
Importance
Weight
Logical Relationship
Alternatives / Components
```

### Step 6 — Vector Retrieval

Requirements are embedded individually and used to retrieve relevant resume evidence from ChromaDB.

### Step 7 — Evidence Validation

Retrieved evidence is evaluated using:

* Semantic similarity
* Explicit lexical evidence
* Structured validation
* Requirement logic

### Step 8 — Deterministic Scoring

Requirement statuses are converted into a weighted JD match score.

### Step 9 — Generative Analysis

Gemini generates recruiter-style explanations and recommendations using the validated results.

### Step 10 — Dashboard

The frontend displays the final analysis through an interactive dashboard.

---

# 🎨 Interactive UI

The application provides a modern responsive interface featuring:

* 🌙 Dark / light mode
* 📊 ATS score visualization
* 🎯 JD match visualization
* 🎉 High-score celebration animation
* ✨ Framer Motion animations
* 🪟 Glassmorphism-inspired UI
* 📱 Responsive design
* 📈 Structured analysis sections
* 🔍 Requirement-level matching insights

---

# 🔐 Privacy & User Control

The application includes privacy-oriented controls:

* User consent before resume processing
* Controlled AI analysis permission
* Environment-based secret management
* Secure file upload handling
* Resume deletion support
* Cloud storage deletion workflow

Users can remove uploaded resumes from storage when required.

---

# 🛠 Tech Stack

| Layer               | Technology                      |
| ------------------- | ------------------------------- |
| Frontend            | React 19                        |
| Build Tool          | Vite                            |
| Styling             | Tailwind CSS 4                  |
| Animation           | Framer Motion                   |
| Backend             | Node.js + Express.js            |
| AI                  | Google Gemini API               |
| RAG                 | Retrieval-Augmented Generation  |
| Vector Database     | ChromaDB                        |
| Embeddings          | Google Generative AI Embeddings |
| AI Orchestration    | MCP                             |
| File Storage        | Cloudinary                      |
| API Communication   | Axios                           |
| Containerization    | Docker                          |
| Frontend Deployment | Vercel                          |
| Backend Deployment  | Render                          |

---

# 🐳 Dockerized Backend

The backend is containerized using Docker for reproducible local development and deployment.

### Docker Hub

```bash
docker pull harshagria/resume-analyzer-backend:v1.0.0
```

### Run Locally

```bash
cd backend

docker-compose up --build
```

---

# 📁 Repository Structure

```text
AI-resume-analyser
│
├── backend
│   ├── src3
│   │   ├── routes
│   │   ├── services
│   │   ├── mcp
│   │   ├── middleware
│   │   └── server.js
│   │
│   ├── utils
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── frontend
│   ├── components
│   ├── api
│   ├── assets
│   ├── App.jsx
│   └── ...
│
└── README.md
```

---

# 🚀 Local Setup

## Clone Repository

```bash
git clone https://github.com/HarshAgria/AI-resume-analyser.git

cd AI-resume-analyser
```

---

# Backend Setup

```bash
cd backend

npm install
```

Create:

```text
.env
```

Add the required environment variables:

```env
PORT=3000

GEMINI_API_KEY=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

FRONTEND_URL=
```

Run the backend:

```bash
npm run dev
```

---

# Frontend Setup

Open another terminal:

```bash
cd frontend

npm install

npm run dev
```

The frontend will connect to the configured backend API.

---

# 🧪 Engineering Highlights

## Backend Engineering

* REST API development
* Resume PDF processing
* File upload and validation
* Cloudinary integration
* AI service integration
* Modular service architecture
* Error handling
* Rate limiting
* Environment-based configuration

---

## AI / RAG Engineering

* Requirement-centric RAG
* ChromaDB vector retrieval
* Requirement-level embeddings
* Semantic evidence retrieval
* Lexical evidence validation
* Structured requirement extraction
* Evidence-strength classification
* Deterministic weighted scoring
* Compound requirement handling
* OR / AND requirement logic
* Resume evidence provenance

---

## MCP Engineering

* Tool-based AI orchestration
* Modular RAG operations
* Requirement extraction tools
* Resume embedding tools
* JD embedding tools
* Evidence retrieval tools
* Separation of AI orchestration from business scoring

---

## Frontend Engineering

* Component-driven React architecture
* Responsive UI
* API integration
* State management
* Interactive data visualization
* Framer Motion animations
* Dark/light mode
* User-centric result presentation

---

## Prompt Engineering

* Structured JSON generation
* Recruiter-style evaluation prompts
* Requirement extraction prompts
* Hallucination-resistant instructions
* Evidence-grounded AI analysis
* Separation of deterministic results from generative explanations

---

# 🧠 Design Principles

### Domain Agnostic

No profession-specific keyword dictionary is required.

The system derives requirements dynamically from the supplied job description.

### Evidence First

A semantic relationship is treated as a retrieval signal, not automatic proof.

### Deterministic Scoring

The final numerical JD match score is calculated by the matching engine rather than being arbitrarily generated by the LLM.

### Explainable Results

Each requirement can be associated with supporting or missing evidence.

### Modular AI Architecture

AI capabilities are separated into independently maintainable services and tools.

---

# 📸 Screenshots

## Landing Page

<img width="1763" height="844" alt="AI Resume Analyzer Landing Page" src="https://github.com/user-attachments/assets/12ff6154-a57f-42fc-a96d-8ce7594945e3" />


## Resume AI Analysis Dashboard

<img width="1763" height="1771" alt="AI Resume Analyzer Dashboard" src="https://github.com/user-attachments/assets/429d8d32-9923-4f75-a206-0b2208bb6f23" />

---

# 🔮 Future Roadmap

## Authentication & User Accounts

* User authentication
* Resume version comparison
* Resume history
* Saved analyses
* Candidate profiles
* Personalized dashboards

---

## AI Career Features

* AI interview preparation
* Cover letter generation
* Resume rewriting
* Job-specific resume optimization
* Interview question generation
* Skill-gap learning recommendations

---

## SaaS Capabilities

* Free tier with limited analyses
* Premium subscriptions
* Payment gateway integration
* Usage-based limits
* Advanced AI recommendations
* Candidate analytics

---

## Cloud Scalability

Potential future infrastructure:

```text
                  CloudFront
                     │
                     ▼
                AWS EC2/ECS
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
       AWS S3               PostgreSQL
          │                     │
          └──────────┬──────────┘
                     │
                  Redis
                     │
                     ▼
                Gemini API
```

Potential migration paths:

* Cloudinary → AWS S3
* Render → AWS ECS / EC2
* Add PostgreSQL
* Add Redis caching
* Introduce background job processing
* Horizontal backend scaling

---

# 🤝 Contributing

Contributions are welcome, particularly around:

* RAG pipeline accuracy
* Complex job-description requirement extraction
* Evidence matching
* Compound requirement handling
* Frontend UI/UX
* Automated testing
* AI evaluation quality
* Performance optimization

### How to Contribute

```bash
# Fork the repository

# Create a feature branch
git checkout -b feature/your-feature

# Make your changes

# Commit
git commit -m "Add your feature"

# Push
git push origin feature/your-feature
```

Then open a Pull Request with a clear description of the changes.

---

# ⚠️ Disclaimer

AI-generated recommendations are intended as informational guidance. Results should be interpreted alongside human judgment and should not be treated as a definitive hiring or employment decision.

---

# 👨‍💻 Author

## Harsh Agria

**R&D Engineer / Technical Lead @ HCLTech**
**NIT Kurukshetra '25**

GitHub:
https://github.com/HarshAgria

LinkedIn:
https://www.linkedin.com/in/iamharshagria

---

# ⭐ Project Motivation

Traditional resume screening often relies heavily on keyword matching and surface-level similarity.

This project explores a more evidence-oriented approach:

```text
Job Description
       ↓
Structured Requirements
       ↓
Requirement-Level Retrieval
       ↓
Resume Evidence
       ↓
Evidence Validation
       ↓
Deterministic Match Score
       ↓
Generative Explanation
```

The goal is to build an **AI hiring copilot** that combines the flexibility of generative AI with the transparency and consistency of deterministic matching systems.

---

# 📜 License
MIT License — see [LICENSE](https://github.com/HarshAgria/AI-resume-analyser/blob/main/LICENSE) for details.

# 🤖 AI Resume Analyzer — AI Hiring Copilot

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-Express-green?logo=node.js)
![Docker](https://img.shields.io/badge/Docker-Containerized-blue?logo=docker)
![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)

An AI-powered resume intelligence platform that analyzes resumes against modern hiring standards and provides recruiter-style feedback, ATS optimization insights, and role-specific improvement recommendations.

Built using **React, Node.js, Docker, Cloudinary, and Google Gemini AI**, this project simulates a modern AI hiring assistant for candidates and recruiting teams.

---

# 🌐 Live Application

### 🚀 Live Demo
[AI Resume Analyzer](https://ai-resume-analyser-eta-five.vercel.app/)

### ❤️ API Health
[Health Check](https://resume-analyzer-backend-fzl4.onrender.com/api/health/)

---

# ✨ Features

## 📄 AI Resume Analysis

Upload a resume and receive an AI-generated recruiter-style evaluation.

The system provides:

- ATS compatibility score
- Resume quality rating
- Personalized resume summary
- Strength analysis
- Improvement recommendations
- Missing keywords
- Target role alignment score
- Recommended job roles

---

## 🎯 Role-Based Resume Evaluation

Users can specify any role they are targeting.

Examples:

- Backend Engineer
- Frontend Developer
- Full Stack Developer
- DevOps Engineer
- Data Engineer
- Data Analyst, etc.

The AI adapts evaluation criteria according to the selected role and analyzes relevant skills, technologies, and experience.

---

## 🤖 Generative AI Integration

Powered by Google Gemini AI to provide:

- Recruiter-style resume feedback
- Structured JSON-based analysis
- ATS optimization suggestions
- Skill gap identification
- Role-specific recommendations

---

## 🎨 Modern Interactive UI

Built with a responsive and engaging user experience:

- 🌙 Dark/light mode support
- 📊 Interactive ATS score visualization
- 🎉 Celebration animation for high ATS scores
- ✨ Smooth UI animations using Framer Motion
- 🪟 Glassmorphism inspired design
- 📱 Responsive layout

---

## 🔐 Privacy & User Control

Implemented privacy-focused features:

- User consent before resume processing
- Controlled AI analysis permission
- Secure resume upload handling
- Resume deletion functionality

Users can remove uploaded resumes from storage when required.

---

# 🏗 Architecture

```
                User
                  │
                  ▼
           React + Tailwind UI
                  │
             Axios Requests
                  │
                  ▼
          Express REST API
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
 Cloudinary Storage     Gemini AI Analysis
        │                    │
        └─────────┬──────────┘
                  ▼
        Structured Resume Analysis
                  │
                  ▼
         Interactive Dashboard
```

### Processing Flow

1. User uploads resume PDF
2. Backend extracts resume content
3. Resume file is stored securely
4. Gemini AI analyzes resume
5. Structured analysis response is generated
6. Frontend displays recruiter insights

---

# 🛠 Tech Stack

| Layer | Technology |
|------|------------|
| Frontend | React.js + Vite |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Backend | Node.js + Express.js |
| AI | Google Gemini API |
| Storage | Cloudinary |
| Containerization | Docker |
| Deployment | Vercel + Render |
| API Communication | Axios |

---

# 🐳 Dockerized Backend

The backend is containerized using Docker for portability and deployment flexibility.

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

# 📸 Screenshots
## Landing page
<img width="1862" height="838" alt="image" src="https://github.com/user-attachments/assets/ae82e85b-ccd2-4d68-ac6c-2218397128b7" />

## Resume AI analysis Dashboard
<img width="1680" height="857" alt="image" src="https://github.com/user-attachments/assets/b4ac52da-0129-4686-be26-6fb17430957f" />

---

# 📁 Repository Structure

```text
AI-resume-analyser
├── backend
│   ├── routes
│   ├── services
│   ├── utils
│   ├── middleware
│   └── Dockerfile
├── frontend
│   ├── components
│   ├── api
│   ├── assets
│   └── App.jsx
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

Create environment file:

```
.env
```

Add:

```env
PORT=3000

GEMINI_API_KEY=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

FRONTEND_URL=
```

Run backend:

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

---

# 📊 Engineering Highlights

## Backend Engineering

- REST API development
- Resume file processing pipeline
- Cloud storage integration
- AI service integration
- Error handling and validation
- Environment-based configuration

## Frontend Engineering

- Component-driven React architecture
- Responsive UI development
- API integration
- State management
- Interactive animations
- User experience optimization

## AI Engineering

- Structured AI output generation
- Role-aware resume evaluation
- ATS scoring logic
- Recruiter-focused recommendations

## Prompt Engineering

- Custom recruiter-style prompt engineering
- Structured JSON outputs
- Hallucination prevention
- Resume timeline validation


---

# 🔒 Security & Privacy

- Environment variable based secret management
- User consent workflow
- Controlled resume processing
- Resume deletion support

---

# 🔮 Future Roadmap

## Authentication System

Planned:
- Resume version comparison
- AI interview preparation
- Cover letter generation
- Admin dashboard
- User profile management
- Resume history dashboard


## SaaS Monetization

Planned:

- Free tier with limited resume analyses
- Premium subscriptions
- Payment gateway integration
- Advanced AI recommendations


## Cloud Scalability

Future AWS migration:

```
CloudFront
      |
AWS EC2 / ECS
      |
AWS S3
      |
Gemini AI API
```

Migration possibilities:

- Cloudinary → AWS S3
- Render → AWS EC2/ECS
- Add PostgreSQL user database
- Add Redis caching



---

# 👨‍💻 Author

## Harsh Agria

Technical Lead @ HCLTech  
NIT Kurukshetra '25

GitHub:
https://github.com/HarshAgria

LinkedIn:
https://www.linkedin.com/in/iamharshagria

---

# ⭐ Project Motivation

This project demonstrates practical experience building an AI-powered SaaS application combining:

- Generative AI
- Full-stack development
- Cloud deployment
- Docker containerization
- Modern frontend engineering
- Production-oriented architecture

The goal is to bridge the gap between traditional resume screening and AI-assisted hiring workflows.
## Disclaimer

AI-generated recommendations are intended as guidance and should complement, not replace, professional career advice or recruiter feedback.

## Copyright

© 2026 Harsh Agria. All Rights Reserved.

This repository is intended for portfolio demonstration and evaluation purposes.
Unauthorized copying, redistribution, or commercial use of the source code is prohibited without prior written permission.

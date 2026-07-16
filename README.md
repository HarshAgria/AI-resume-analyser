# 🤖 AI Resume Analyzer — AI Hiring Copilot

An AI-powered resume intelligence platform that analyzes resumes against modern hiring standards and provides recruiter-style feedback, ATS optimization insights, and role-specific improvement recommendations.

Built using **React, Node.js, Docker, Cloudinary, and Google Gemini AI**, this project simulates a modern AI hiring assistant for candidates and recruiting teams.

---

# 🌐 Live Application

### Frontend
https://ai-resume-analyser-eta-five.vercel.app/

### Backend API Health
https://resume-analyzer-backend-fzl4.onrender.com/api/health

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
- Data Analyst

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
                   |
                   |
             React Frontend
                   |
                   |
             Node.js API
                   |
        -----------------------
        |                     |
   Cloudinary             Gemini AI
   Storage                Analysis
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

### Docker Image

```
harshagria/resume-analyzer-backend:v1.0.0
```

### Run Locally

```bash
cd backend

docker-compose up --build
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

- Prompt engineering
- Structured AI output generation
- Role-aware resume evaluation
- ATS scoring logic
- Recruiter-focused recommendations

---

# 🔒 Security & Privacy

Implemented:

- Environment variable based secret management
- User consent workflow
- Controlled resume processing
- Resume deletion support

Future improvements:

- Authentication
- User profiles
- Resume history management
- Role-based access control

---

# 🔮 Future Roadmap

## Authentication System

Planned:

- Google OAuth login
- Email/password authentication
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

# 📸 Screenshots

(Add screenshots)

Recommended screenshots:

- Landing page
- Resume upload screen
<img width="1862" height="838" alt="image" src="https://github.com/user-attachments/assets/ae82e85b-ccd2-4d68-ac6c-2218397128b7" />

- ATS score dashboard
- AI analysis results
- Dark mode interface
<img width="1680" height="857" alt="image" src="https://github.com/user-attachments/assets/b4ac52da-0129-4686-be26-6fb17430957f" />


---

# 👨‍💻 Author

## Harsh Agria

Technical Lead @ HCLTech  
NIT Kurukshetra '25

GitHub:
https://github.com/HarshAgria

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

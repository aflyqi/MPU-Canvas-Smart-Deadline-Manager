# MPU Canvas Smart Deadline Manager

**A Smart Deadline Management Tool for Macao Polytechnic University Students on Canvas**

- This tool enabling students to view all their courses, assignments, and quizzes in one place. It intelligently detects completion status and highlights tasks approaching their deadlines — helping students stay organized and never miss important due dates.

## 🎥 Video Demo
### The demo video is in video/demo.mp4.


### ✍️Development process
This project development follows Agile method
![interface](https://raw.githubusercontent.com/aflyqi/MPU-Canvas-Smart-Deadline-Manager/main/screenshot.png)

**Reason for Choosing This Process**:

  - Compared to the traditional Waterfall model, it offers greater flexibility to deal with the change of Canvas platform.
- The process of development is simple which can be finished in a short time.


## 📋 Project Purpose

**MPU Canvas Smart Deadline Manager** addresses a common challenge faced by students at Macao Polytechnic University: managing deadlines across multiple courses on the Canvas platform.

### 💡What we solved
- Deadlines for assignments and quizzes are scattered across different courses.
- Frequent logins are required to check the latest status.
- It is difficult to quickly distinguish between completed and pending tasks.

**Target Users**: Students at Macao Polytechnic University.


## 🛠 Tech Stack

### Frontend
- React 18 + Vite 6
- Framer Motion (for smooth page animations and transitions)
- Custom i18n implementation (`src/i18n.js`) — default language: English, with full Chinese support
- localStorage (stores only selected course IDs; no passwords or sensitive data)

### Backend
- Node.js + Express 4

### Core Libraries
- **HTTP Client & Session Management**: `got` (with Cookie Jar and redirect support) + `tough-cookie`
- **HTML Parsing**: `cheerio`
- **Canvas Interaction**: Strict adherence to Canvas behavior, including proper headers (`Accept`, `X-CSRF-Token`, etc.)

## ✨ Key Features

- **Secure Proxy Login**: Simulates browser-based LDAP login to Canvas without storing credentials
- **Course List Retrieval**:
  - Primary: `/api/v1/dashboard/dashboard_cards` API
  - Fallback: Parsing `STUDENT_PLANNER_COURSES` JSON from homepage HTML (using balanced parentheses extraction)
- **Assignments & Quizzes Fetching**:
  - Uses `/api/v1/courses/:course_id/assignment_groups` with pagination support
  - Flattens assignment groups for easier processing
- **Intelligent Completion Status Detection** (Read-only):
  - **Assignments**: Parses assignment detail page HTML for “In Progress” text
  - **Quizzes**: Checks for “Last Attempt Details” / “Submission Details” in HTML, with fallback to submissions API (`workflow_state` or `finished_at`)
- **Bilingual Interface**: English/Chinese switching
- **Deadline Highlighting**: Visually emphasizes tasks nearing their due dates

## 🏗 System Architecture

1. **Login Phase**:
   - Frontend sends credentials to backend `POST /api/login`
   - Backend performs LDAP login (handling CSRF token and redirects with `followRedirect: false`)
   - Generates a `sessionId` and returns it to the frontend

2. **Data Request Phase**:
   - Frontend includes `X-Session-Id` header in subsequent requests
   - Backend retrieves the corresponding Canvas session and proxies the request

All operations are strictly read-only to ensure no changes are made to Canvas records.  
  
    
      
        
## 📋 Software Development Plan

### 👥 Team Members (Roles & Responsibilities)

- **WANG TAOUAN** — **Frontend Developer**  

- **HUANG MOHAN** — **Backend Developer**  

- **CHEN HONGUAN** — **Testing & Documentation**  
### ⚙️ Core Algorithms & Logic

- LDAP login flow with CSRF token extraction and safe redirect handling (`followRedirect: false`)
- Hybrid course data fetching (API-first using `/api/v1/dashboard/dashboard_cards`, with HTML fallback parsing `STUDENT_PLANNER_COURSES`)
- Read-only completion status detection combining HTML text matching (“In Progress”, “Last Attempt Details”) and Canvas submissions API

### 📊 Current Status

- [x] successfully fetching deadline . 
- [x] supports both English and Chinese interfaces.

### 🚀 Future Plans

- [ ] Add advanced sorting, filtering, and search capabilities
- [ ] Support more language(Portuguese、Korean)
- [ ] Implement deadline notifications (desktop or email)
- [ ] support IOS & Android

## 📥 Installation

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Steps
```bash
# Clone the repository
git clone https://github.com/aflyqi/MPU-Canvas-Smart-Deadline-Manager.git
cd MPU-Canvas-Smart-Deadline-Manager

# Install
npm install

# Start the backend server (in one terminal)
npm run server

# Start the frontend (in another terminal)
npm run dev

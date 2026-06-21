# Interview Guard AI — Frontend

AI-powered interview integrity and monitoring platform for technical interviews. Built with Angular 22, TypeScript, and TailwindCSS.

## Overview

Interview Guard AI provides real-time candidate monitoring during technical interviews. Recruiters can schedule interviews, monitor candidate behavior via WebRTC video calls, detect suspicious activity through AI-powered face monitoring and browser event tracking, and generate trust-scored risk reports with PDF export.

## Features

### Authentication
- JWT-based login and registration
- Role-based access control (Recruiter / Candidate)
- Route guards for protected pages

### Interview Management
- Create, list, and manage interviews
- Unique 6-character alphanumeric access codes
- Status management (Scheduled → Active → Completed)

### Video Calling
- Peer-to-peer WebRTC video calls
- Audio/video mute controls
- Fullscreen mode
- Participant strip with connection indicators

### Collaborative Workspace
- Monaco-based code editor (5 languages)
- Excalidraw-style collaborative whiteboard
- Split-panel layout with resizable divider
- Real-time code and whiteboard synchronization via Socket.IO
- Auto-save with debounced persistence

### Monitoring Engine
- Tab switch detection (visibility change API)
- Window blur detection
- Copy/paste event tracking
- Fullscreen exit detection
- Debounced event reporting (1.5s threshold)

### Face Monitoring
- MediaPipe FaceLandmarker integration
- No face detection → NO_FACE event
- Multiple face detection → MULTIPLE_FACE event
- Gaze direction tracking → FACE_AWAY event
- Analyzes existing WebRTC camera stream (no second camera)
- 1.2s analysis interval with GPU acceleration

### Trust Score Engine
- 100-point baseline score
- Event-based deductions (TAB_SWITCH: -5, PASTE: -15, NO_FACE: -15, etc.)
- Real-time score updates via Socket.IO
- Risk levels: LOW (≥80), MEDIUM (50-79), HIGH (<50)

### Recruiter Dashboard
- Real-time candidate monitoring cards
- Live trust score updates
- Event statistics per candidate
- Live feed sidebar with streaming events
- View Report and Download PDF actions per candidate

### Reports
- Rule-based AI risk report generation
- Interview Summary, Risk Summary, Behavior Analysis, Final Recommendation
- PDF export with pdfkit (candidate info, statistics, recommendation)
- Download directly from dashboard or report page

## Tech Stack

| Technology | Purpose |
|---|---|
| Angular 22 | Frontend framework |
| TypeScript 6 | Type-safe development |
| TailwindCSS 4 | Utility-first styling |
| RxJS 7 | Reactive state management |
| Socket.IO Client 4 | Real-time WebSocket communication |
| WebRTC | Peer-to-peer video calling |
| Monaco Editor | Collaborative code editor |
| MediaPipe Tasks Vision | AI face detection and gaze tracking |
| Angular Material | UI component library |
| Chart.js / ng2-charts | Data visualization |
| pdfkit | PDF report generation (backend) |

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/interview-guard-ai.git
cd interview-guard-ai/frontend

# Install dependencies
npm install

# Start development server
ng serve
```

## Environment Variables

Configure `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: '{$baseurl}/api/v1',
};
```

## Running Locally

```bash
# Development server (default port 4200)
ng serve

# Build for production
ng build

# Run tests
ng test
```

## Build Commands

| Command | Description |
|---|---|
| `ng serve` | Start dev server with hot reload |
| `ng build` | Production build to `dist/` |
| `ng build --configuration production` | Optimized production build |
| `ng test` | Run unit tests with Vitest |

## Folder Structure

```
frontend/src/
├── app/
│   ├── core/                    # Singleton services, guards, interceptors
│   │   ├── constants/           # API endpoint constants
│   │   ├── guards/              # Route guards (auth, role)
│   │   ├── interceptors/        # HTTP interceptors (JWT)
│   │   ├── layout/              # Layout wrappers (auth, dashboard, interview)
│   │   ├── models/              # TypeScript interfaces and types
│   │   ├── services/            # Injectable services
│   │   └── theme/               # Design tokens and theme constants
│   ├── features/                # Feature modules (lazy-loaded)
│   │   ├── auth/                # Login, Register
│   │   ├── candidate/           # Candidate join page
│   │   ├── dashboard/           # Home dashboard
│   │   ├── interview-room/      # Video call, code editor, whiteboard
│   │   ├── recruiter/           # Interview management, live monitoring
│   │   └── reports/             # Risk reports and PDF export
│   ├── shared/                  # Shared components and modules
│   ├── app.routes.ts            # Route configuration
│   └── app.config.ts            # Application providers
├── environments/                # Environment configs
└── styles.css                   # Global styles and TailwindCSS
```

## Screenshots

> Screenshots coming soon

- Login Page
- Recruiter Dashboard
- Interview Room (Video + Code Editor + Whiteboard)
- Live Monitoring Feed
- Risk Report with PDF Export

## Future Improvements

- [ ] Candidate performance analytics dashboard
- [ ] Interview recording and playback
- [ ] AI-powered question suggestions
- [ ] Mobile-responsive interview room
- [ ] Email notification for interview invites
- [ ] Batch interview scheduling
- [ ] Candidate comparison reports
- [ ] Admin panel for user management


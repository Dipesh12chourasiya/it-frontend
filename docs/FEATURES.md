# Interview Guard AI — Feature Inventory

Complete inventory of all implemented features, organized by module.

---

## Authentication Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| User Registration | Create new accounts with name, email, password | All | Implemented |
| User Login | JWT-based authentication | All | Implemented |
| JWT Token Management | Store, retrieve, and attach tokens to requests | System | Implemented |
| Route Guards | Protect routes by auth status and user role | System | Implemented |
| Role-Based Access Control | Restrict pages to recruiter or candidate roles | System | Implemented |
| Session Persistence | Restore user session from localStorage on reload | System | Implemented |
| Logout | Clear token and user data, redirect to login | All | Implemented |

---

## Interview Management Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| Create Interview | Schedule new interviews with title, description, time | Recruiter | Implemented |
| List Interviews | View all created interviews with status | Recruiter | Implemented |
| Interview Detail | View interview details, code, and metadata | Recruiter | Implemented |
| Update Interview Status | Change status: scheduled → active → completed | Recruiter | Implemented |
| Generate Access Code | Unique 6-character alphanumeric code per interview | System | Implemented |
| Join by Code | Candidate enters code to join an interview | Candidate | Implemented |
| Interview Validation | Verify code format and interview existence | System | Implemented |

---

## Video Calling Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| WebRTC Video Call | Peer-to-peer video communication | Both | Implemented |
| Audio Mute/Unmute | Toggle microphone during call | Both | Implemented |
| Camera On/Off | Toggle video feed during call | Both | Implemented |
| Fullscreen Mode | Expand video to fullscreen | Both | Implemented |
| Participant Strip | Show all participants with status indicators | Both | Implemented |
| ICE Candidate Handling | NAT traversal via STUN servers | System | Implemented |
| Peer Connection Management | Create, maintain, and clean up RTCPeerConnection | System | Implemented |
| Stream Propagation | Share local stream, receive remote stream | System | Implemented |

---

## Workspace Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| Monaco Code Editor | Collaborative code editing with syntax highlighting | Both | Implemented |
| Multi-Language Support | JavaScript, TypeScript, Python, Java, C++ | Both | Implemented |
| Collaborative Whiteboard | Drawing, shapes, text, undo/redo | Both | Implemented |
| Split Panel Layout | Resizable code editor + whiteboard side by side | System | Implemented |
| Real-Time Code Sync | Sync code changes via Socket.IO | System | Implemented |
| Real-Time Whiteboard Sync | Sync drawing changes via Socket.IO | System | Implemented |
| Auto-Save | Debounced workspace persistence (3s) | System | Implemented |
| Workspace Restore | Load saved workspace on rejoin | System | Implemented |

---

## Monitoring Engine Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| Tab Switch Detection | Detect when candidate switches browser tabs | System | Implemented |
| Window Blur Detection | Detect when window loses focus | System | Implemented |
| Copy Event Detection | Track copy actions in the browser | System | Implemented |
| Paste Event Detection | Track paste actions globally and in Monaco Editor | System | Implemented |
| Fullscreen Exit Detection | Detect when candidate exits fullscreen mode | System | Implemented |
| DevTools Detection | Detect browser developer tools opening | System | Implemented |
| Event Debouncing | Prevent duplicate events within 1.5s window | System | Implemented |
| Event Logging | POST events to backend monitoring API | System | Implemented |
| Real-Time Event Streaming | Broadcast events to recruiters via Socket.IO | System | Implemented |

---

## Face Monitoring Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| Face Detection | Detect presence/absence of face in video feed | System | Implemented |
| No Face Detection | Flag when no face is visible | System | Implemented |
| Multiple Face Detection | Flag when more than one face is visible | System | Implemented |
| Gaze Direction Tracking | Detect looking left, right, or down | System | Implemented |
| Face Away Detection | Flag when candidate looks away from screen | System | Implemented |
| GPU-Accelerated Analysis | Use MediaPipe FaceLandmarker with GPU delegate | System | Implemented |
| Stream Reuse | Analyze existing WebRTC camera stream (no second camera) | System | Implemented |
| Interval-Based Analysis | Process frames every 1.2s to prevent CPU spikes | System | Implemented |
| Event Debouncing | Prevent duplicate face events within 4s window | System | Implemented |

---

## Trust Score Engine Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| Baseline Score | Start each session at 100 points | System | Implemented |
| Event-Based Deductions | Deduct points per event type | System | Implemented |
| Real-Time Score Updates | Push updated scores via Socket.IO | System | Implemented |
| Risk Level Classification | LOW (≥80), MEDIUM (50-79), HIGH (<50) | System | Implemented |
| Score Persistence | Store final score in session document | System | Implemented |
| Score Decay Prevention | Floor at 0 (no negative scores) | System | Implemented |

### Deduction Table

| Event | Points Deducted |
|---|---|
| TAB_SWITCH | -5 |
| WINDOW_BLUR | -3 |
| COPY | -10 |
| PASTE | -15 |
| FULLSCREEN_EXIT | -10 |
| DEVTOOLS_OPEN | -20 |
| NO_FACE | -15 |
| MULTIPLE_FACE | -20 |
| FACE_AWAY | -5 |

---

## Recruiter Dashboard Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| Interview Selector | Choose which interview to monitor | Recruiter | Implemented |
| Candidate Monitor | View all candidates with trust scores | Recruiter | Implemented |
| Real-Time Score Updates | Live trust score changes on candidate cards | Recruiter | Implemented |
| Event Statistics | Per-candidate event counts (tab, paste, face, etc.) | Recruiter | Implemented |
| Live Feed Sidebar | Streaming event log with timestamps | Recruiter | Implemented |
| Candidate Card Actions | View Report and Download PDF buttons | Recruiter | Implemented |
| Connection Status Indicators | Online/Offline/Reconnecting per candidate | Recruiter | Implemented |
| Auto-Refresh | Dashboard refreshes every 10 seconds | Recruiter | Implemented |
| Candidate Expansion | Click to expand detailed event statistics | Recruiter | Implemented |

---

## Reports Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| Rule-Based Report Generation | Deterministic text report from event data | Recruiter | Implemented |
| Interview Summary | Duration, event count, monitoring status | Recruiter | Implemented |
| Risk Summary | Trust score, risk level, behavioral context | Recruiter | Implemented |
| Behavior Analysis | Bullet list of detected events | Recruiter | Implemented |
| Final Recommendation | RECOMMENDED / REVIEW REQUIRED / HIGH RISK | Recruiter | Implemented |
| Candidate Selector | Switch between candidates for same interview | Recruiter | Implemented |
| PDF Export | Download formatted PDF report via pdfkit | Recruiter | Implemented |
| Report Page | Full-page report view with all sections | Recruiter | Implemented |
| Export Button | Download PDF from report page or dashboard | Recruiter | Implemented |

---

## UI/UX Module

| Feature | Purpose | User Role | Status |
|---|---|---|---|
| Dark Theme | Consistent dark UI across all pages | All | Implemented |
| Responsive Layout | Mobile, tablet, and desktop support | All | Implemented |
| TailwindCSS Utility Classes | Rapid, consistent styling | Developer | Implemented |
| Angular Material Components | Form inputs, date pickers, selections | All | Implemented |
| Loading States | Spinners and skeleton loaders | All | Implemented |
| Error States | Error messages with recovery actions | All | Implemented |
| Empty States | Meaningful empty state messages | All | Implemented |
| Toast Notifications | Success/error feedback | All | Implemented |
| Smooth Transitions | CSS transitions and animations | All | Implemented |
| Page Containers | Consistent page layout with spacing | All | Implemented |
| Card Surfaces | Elevated card components with borders | All | Implemented |
| Status Badges | Color-coded status indicators | All | Implemented |
| Live Indicators | Pulsing dots for real-time status | All | Implemented |

---

## Summary

| Category | Feature Count | Status |
|---|---|---|
| Authentication | 7 | All Implemented |
| Interview Management | 7 | All Implemented |
| Video Calling | 8 | All Implemented |
| Workspace | 8 | All Implemented |
| Monitoring Engine | 9 | All Implemented |
| Face Monitoring | 9 | All Implemented |
| Trust Score Engine | 6 | All Implemented |
| Recruiter Dashboard | 9 | All Implemented |
| Reports | 9 | All Implemented |
| UI/UX | 13 | All Implemented |
| **Total** | **85** | **All Implemented** |

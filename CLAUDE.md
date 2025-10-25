# ⚠️ CRITICAL MANDATORY INSTRUCTION ⚠️

## YOU MUST READ AND FOLLOW ZEAMI.md WITHOUT EXCEPTION

**THIS IS NON-NEGOTIABLE: You are REQUIRED to read the ZEAMI.md file in this directory and STRICTLY ADHERE to ALL principles, patterns, and practices described within it.**

### MANDATORY REQUIREMENTS:
1. **ALWAYS** apply the best practices for EVERY technology domain
2. **NEVER** reinvent the wheel - use established solutions
3. **ALWAYS** solve root causes, NOT symptoms
4. **NEVER** create overly complex solutions
5. **ALWAYS** follow the error patterns and solutions in ZEAMI.md

### YOU MUST:
- Read ZEAMI.md BEFORE making ANY implementation decisions
- Reference ZEAMI.md patterns when solving problems
- Apply ALL best practices as specified
- Follow the error resolution patterns EXACTLY
- Implement the design patterns as documented

**FAILURE TO COMPLY WITH ZEAMI.md IS CONSIDERED A CRITICAL VIOLATION.**

Refer to: [ZEAMI.md](./ZEAMI.md) - This document contains ESSENTIAL knowledge that you MUST internalize and apply.

---

# ComChat Project Documentation

## Project Overview

**ComChat** is a completely free P2P video conference application that enables seamless communication between distant friends and colleagues.

### Key Specifications
- **Maximum Participants:** 6 people (P2P limitation)
- **Technology:** PeerJS (WebRTC P2P)
- **Platform:** Web Application (Browser-based)
- **Cost:** Completely Free
- **Target:** Personal use → General public

## Features (Phase 1)

### Core Video Conference Features
- ✅ Video calling (max 6 people)
- ✅ Audio calling
- ✅ Real-time chat
- ✅ Participant list with names
- ✅ Screen sharing
- ✅ Recording functionality
- ✅ File sharing

### User Experience Features
- ✅ Name change capability
- ✅ Background filters/effects
- ✅ Reactions (Periscope-style hearts)
- ✅ Invite system (URL sharing)
- ✅ Room password protection

## Technical Architecture

### Technology Stack
```yaml
Frontend: HTML5 + CSS3 + JavaScript (ES6+)
P2P Library: PeerJS
WebRTC: Browser native
Styling: CSS (→ TailwindCSS later)
Deployment: GitHub Pages / Netlify
```

### P2P Architecture Benefits
- **Zero server costs** (completely free operation)
- **Low latency** (direct peer connections)
- **Privacy protection** (no data stored on servers)
- **Scalable** (no server load concerns)

### Limitations & Solutions
- **6-person limit** due to bandwidth/CPU constraints
- **Firewall traversal** handled by STUN/TURN servers
- **Connection stability** improved with retry mechanisms

## Development Guidelines

### Code Quality Standards
- Simple, readable code
- Comment-free implementation (self-documenting)
- Single responsibility principle
- Error handling at every connection point

### Testing Strategy
- Manual testing with multiple browser tabs
- Real-world testing with actual friends
- Cross-browser compatibility (Chrome, Firefox, Safari)
- Mobile responsiveness testing

## File Structure
```
/
├── index.html          # Main application page
├── css/
│   └── style.css      # Application styles
├── js/
│   ├── app.js         # Main application logic
│   ├── peer.js        # PeerJS wrapper and connection handling
│   └── ui.js          # User interface management
├── ZEAMI.md           # AI knowledge system
├── CLAUDE.md          # This file
└── README.md          # User documentation
```

## Development Progress

### Current Status: MVP Development
- [x] Project initialization
- [x] ZEAMI framework setup
- [ ] Basic HTML structure
- [ ] PeerJS integration
- [ ] 1-on-1 video calling
- [ ] Multi-person support
- [ ] Chat functionality
- [ ] Additional features

## Future Enhancements (Phase 2)

### Breakout Rooms
- Sub-room creation (2-4 rooms)
- Participant distribution by host
- Room switching functionality

### Advanced Features
- Whiteboard sharing
- Calendar integration
- Meeting scheduling
- Analytics dashboard

## Deployment Strategy

### MVP Deployment
1. GitHub repository setup
2. GitHub Pages hosting
3. Custom domain (optional)

### Production Deployment
1. CDN integration
2. Performance optimization
3. PWA capabilities
4. Mobile app consideration

---

## Important Reminders

### For Development
- **Always test with multiple participants**
- **Ensure cross-browser compatibility**
- **Handle connection failures gracefully**
- **Maintain 6-person limit for stability**

### For User Experience
- **Keep interface simple and intuitive**
- **Provide clear error messages**
- **Ensure quick connection setup**
- **Maintain high video/audio quality**

---

*This document is part of the ZEAMI Framework compliance system.*
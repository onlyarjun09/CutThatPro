# CutThat Pro — DEFINITIVE BUILD PLAN
## Final Architecture, Features, Implementation Details
### Date: May 29, 2026 | Status: LOCKED — No changes after this

---

## 1. FINAL ARCHITECTURE (LOCKED)

```
┌─────────────────────────────────────────────────────────────┐
│                    Premiere Pro (Host)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  CutThat Pro CEP Panel                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │ index.html│  │ main.js  │  │ CSInterface.js   │   │  │
│  │  │ (UI/Tabs) │  │ (Logic)  │  │ (Bridge)         │   │  │
│  │  └─────┬────┘  └────┬─────┘  └────────┬─────────┘   │  │
│  │        │             │                  │             │  │
│  │  ┌─────▼─────────────▼──────────────────▼─────────┐  │  │
│  │  │           host.jsx (ExtendScript)               │  │  │
│  │  │  - getMediaPath() from timeline clips           │  │  │
│  │  │  - duplicateSequence()                          │  │  │
│  │  │  - applyCutPlan() via QE API                    │  │  │
│  │  │  - insertMarkers()                              │  │  │
│  │  │  - importFiles() for B-roll                     │  │  │
│  │  └────────────────────┬────────────────────────────┘  │  │
│  └───────────────────────│────────────────────────────────┘  │
│                          │                                    │
└──────────────────────────│────────────────────────────────────┘
                           │ fetch() HTTP
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend Server (Node.js Express :3456)                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  POST /analyze-silence    → FFmpeg silencedetect        │ │
│  │  POST /analyze-whisper    → Whisper transcription       │ │
│  │  POST /analyze-combined   → FFmpeg + Whisper combined   │ │
│  │  POST /extract-keywords   → LLM keyword extraction      │ │
│  │  POST /search-broll       → Pexels API search           │ │
│  │  POST /generate-captions  → Whisper → SRT generation    │ │
│  │  GET  /health             → Status check                │ │
│  └─────────────────────────────────────────────────────────┘ │
│                          │                                    │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │  External Tools (Local)                                 │  │
│  │  - FFmpeg v8.1.1 (audio extraction + silence detect)   │  │
│  │  - faster-whisper (transcription, VAD)                  │  │
│  │  - LM Studio / Qwen 3.6 35B (keyword extraction)       │  │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Why CEP (Not UXP)?
- CEP has full access to `app.encoder`, QE API, `importFiles()`
- UXP lacks audio export, limited timeline manipulation
- CEP works on Premiere 14.0+ (all versions)
- Research score: CEP 7.1/10, UXP 7.0/10 for Phase 1

### Why Node.js Backend (Not Python)?
- Node.js runs inside CEP panel (same process, no extra server)
- Express is simpler than FastAPI for this use case
- FFmpeg spawned via `child_process` — works same as Python
- Whisper called via Python subprocess (best of both worlds)

---

## 2. FEATURES (LOCKED — 6 Features)

### Feature 1: Auto Cut (Silence Removal) — CORE
**Status:** Building now
**How it works:**
1. User clicks "Analyze" → ExtendScript gets source media path from timeline
2. Backend extracts audio via FFmpeg: `ffmpeg -i video.mp4 -vn -ar 16000 -ac 1 audio.wav`
3. Backend runs FFmpeg `silencedetect` → returns silence gaps
4. Backend runs Whisper transcription → returns word timestamps
5. Combined analysis: silence gaps + transcript gaps = cut candidates
6. User reviews cuts in panel → clicks "Apply Clean Cut"
7. ExtendScript applies cuts via QE API (razor + ripple delete)

**API Flow:**
```
Panel → POST /analyze-combined { filePath, threshold, minDuration }
Backend → FFmpeg extract audio → silencedetect + Whisper
Backend → Returns { cuts: [{start, end, duration, category}] }
Panel → User reviews → POST /apply-cuts { cuts, mode }
ExtendScript → QE API → Timeline edits
```

### Feature 2: Captions (Whisper SRT)
**Status:** Planned
**How it works:**
1. Reuses Whisper transcription from Auto Cut
2. Generates SRT file from transcript segments
3. Imports SRT into Premiere via `app.project.importFiles()`
4. Places captions on dedicated caption track

### Feature 3: Zoom (Dynamic Keyframes)
**Status:** Planned
**How it works:**
1. Whisper transcript identifies emphasis words (keywords)
2. LLM scores "importance" of each segment
3. ExtendScript adds scale keyframes at emphasis points
4. Uses `trackItem.components` to access Motion > Scale

### Feature 4: B-Roll (Stock Footage Auto-Insert)
**Status:** Planned
**How it works:**
1. Whisper transcribes audio → LLM extracts visual keywords
2. Pexels API searches stock footage (FREE, 200 req/hr)
3. LLM scores relevance of each stock clip
4. FFmpeg finds silence/transition points in timeline
5. ExtendScript imports stock clips via `app.project.importFiles()`
6. Places B-roll on V2 track at cut points
7. User reviews + adjusts

**Cost:** ~$0 per video (Pexels free, LLM local, Whisper local)

### Feature 5: Chapter Markers
**Status:** Planned
**How it works:**
1. Whisper transcript → LLM identifies topic changes
2. LLM generates chapter titles
3. ExtendScript adds markers via QE API: `qeSeq.addMarker()`

### Feature 6: Settings
**Status:** Building now
**Features:**
- FFmpeg path configuration
- Whisper model selection (tiny/base/small/medium/large)
- Silence threshold (-50dB to -10dB)
- Min silence duration (0.1s to 2.0s)
- Cut style (Soft/Natural/Tight/Aggressive)
- Track targeting (V1/V2/All, A1/A2/All)
- API keys (Pexels, Gemini — optional)

---

## 3. FILE STRUCTURE (LOCKED)

```
CutThatPro/
├── CSXS/
│   └── manifest.xml              # CEP manifest (CSXS 9.0, PPRO 14.0+)
├── index.html                    # Main UI (5 tabs)
├── css/
│   └── style.css                 # Dark theme (Premiere aesthetic)
├── js/
│   ├── CSInterface.js            # Adobe bridge library (standard)
│   └── main.js                   # Panel logic, tab management, API calls
├── jsx/
│   └── host.jsx                  # ExtendScript (Premiere DOM, QE API)
├── backend/
│   ├── server.js                 # Node.js Express (FFmpeg + Whisper endpoints)
│   ├── package.json              # Dependencies (express, cors)
│   ├── whisper_analyzer.py       # Whisper transcription + silence detection
│   └── keyword_extractor.py      # LLM keyword extraction (optional)
├── presets/
│   └── CutThatPro_AudioOnly.epr  # Audio export preset (MUST EXIST)
├── icons/
│   ├── icon-22.png               # Panel icon (22x22)
│   └── icon-44.png               # Panel icon (44x44)
├── temp/                         # Temporary files (auto-created)
├── .gitignore
├── SPEC.md                       # Architecture spec
└── PLAN.md                       # This file
```

---

## 4. TECHNICAL DECISIONS (LOCKED)

### Audio Extraction Approach
**Decision:** Get source media path via ExtendScript → FFmpeg extracts audio directly
**Why:** No Media Encoder dependency, faster, works in background
**Implementation:**
```javascript
// host.jsx — Get source file path from timeline
function getSourceMediaPath() {
    var seq = app.project.activeSequence;
    var clip = seq.videoTracks[0].clips[0];
    return clip.projectItem.getMediaPath();
}

// Backend — Extract audio via FFmpeg
ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio.wav
```

### Silence Detection Approach
**Decision:** FFmpeg `silencedetect` (primary) + Whisper VAD (secondary)
**Why:** FFmpeg is fast and reliable, Whisper adds transcript-based gap detection
**Implementation:**
```bash
# FFmpeg silence detection
ffmpeg -i audio.wav -af "silencedetect=noise=-35dB:d=0.4" -f null -

# Whisper transcription (for transcript-based gaps)
faster-whisper transcribe audio.wav --model base --vad-filter
```

### Timeline Editing Approach
**Decision:** QE API for cuts, ExtendScript for imports
**Why:** QE API has direct timeline access, ExtendScript for file operations
**Implementation:**
```javascript
// host.jsx — Apply cuts via QE API
function applyCutPlan(cuts) {
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    // Sort cuts in reverse (so indices don't shift)
    cuts.sort(function(a, b) { return b.start - a.start; });
    for (var i = 0; i < cuts.length; i++) {
        // Razor at start and end, then delete the segment
        qeSeq.razor(cuts[i].start);
        qeSeq.razor(cuts[i].end);
        // Select and delete the segment
    }
}
```

### LLM Integration Approach
**Decision:** LM Studio (Qwen 3.6 35B) for keyword extraction, chapter generation
**Why:** Local, free, private, fast on M3 Ultra (256GB RAM)
**Implementation:**
```python
# keyword_extractor.py
import requests
response = requests.post("http://localhost:1234/v1/chat/completions", json={
    "model": "qwen3.6-35b-a3b",
    "messages": [{"role": "user", "content": f"Extract 5 visual keywords from: {transcript}"}]
})
```

---

## 5. IMPLEMENTATION ORDER (LOCKED)

### Phase 1: Core (Auto Cut) — CURRENT
1. ✅ Project structure
2. ✅ manifest.xml
3. ✅ CSInterface.js
4. ✅ index.html (5 tabs)
5. ✅ css/style.css
6. ✅ host.jsx (ExtendScript)
7. ✅ main.js (Panel logic)
8. ✅ server.js (Backend)
9. ✅ whisper_analyzer.py
10. 🔄 **TEST IN PREMIERE** — Get it working end-to-end
11. 🔄 Fix any bugs
12. 🔄 Push to GitHub

### Phase 2: Captions
1. Add SRT generation to backend
2. Add SRT import to host.jsx
3. Add Captions tab UI
4. Test end-to-end

### Phase 3: Zoom
1. Add keyword extraction to backend
2. Add scale keyframe insertion to host.jsx
3. Add Zoom tab UI
4. Test end-to-end

### Phase 4: B-Roll
1. Add Pexels API integration to backend
2. Add keyword extraction via LLM
3. Add media import to host.jsx
4. Add B-Roll tab UI
5. Test end-to-end

### Phase 5: Chapter Markers
1. Add chapter generation to backend
2. Add marker insertion to host.jsx
3. Test end-to-end

### Phase 6: Polish
1. Settings persistence (localStorage)
2. Error handling improvements
3. Loading states / progress bars
4. GitHub Actions CI/CD
5. Documentation

---

## 6. TESTING CHECKLIST

### Before Each Test
- [ ] Backend running on :3456 (`curl http://127.0.0.1:3456/health`)
- [ ] CEP debug mode enabled (`defaults read com.adobe.CSXS.9 PlayerDebugMode`)
- [ ] Premiere restarted after code changes (Cmd+Q → reopen)

### Auto Cut Test
- [ ] Panel loads in Premiere (Window → Extensions → CutThat Pro)
- [ ] "Test Connection" shows "PING_OK"
- [ ] "Analyze" gets source media path (no Media Encoder)
- [ ] Backend extracts audio via FFmpeg
- [ ] Backend runs Whisper transcription
- [ ] Results show silence gaps
- [ ] "Apply Clean Cut" edits timeline
- [ ] Undo works (Ctrl+Z)

### Edge Cases
- [ ] No video in timeline → clear error message
- [ ] Multiple video tracks → picks V1
- [ ] Audio-only sequence → picks A1
- [ ] Long video (1hr+) → progress indicator
- [ ] Network error → graceful fallback

---

## 7. COMPETITIVE POSITIONING

| Feature | Phantom Editor | CutThat Pro | Our Advantage |
|---------|---------------|-------------|---------------|
| Silence Removal | ✅ Free | ✅ Core | Same |
| Captions | ✅ Cloud (paid) | ✅ Local (free) | No API cost |
| B-Roll | ❌ Not built | ✅ Local + Pexels | NEW feature |
| Multi-Cam | ✅ Wraith | 📋 Future | — |
| Repeat Removal | ✅ Gemini (paid) | ✅ Local LLM | No API cost |
| Chapters | ✅ Gemini Flash | ✅ Local LLM | No API cost |
| **Processing** | Cloud | **100% Local** | Privacy, speed |
| **Cost per video** | $0.50+ | **$0.00** | Zero marginal cost |
| **Offline mode** | ❌ | ✅ | Works anywhere |

**Unique Selling Points:**
1. 100% local processing (privacy-first)
2. Zero API costs (M3 Ultra handles everything)
3. B-Roll auto-insert (competitors don't have this)
4. Works offline
5. One-time purchase (no subscription)

---

## 8. PRICING STRATEGY

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Silence Removal, Basic Captions |
| Pro | $49 one-time | All features (Zoom, B-Roll, Chapters, Advanced Captions) |
| Team | $149 one-time | 5 seats + priority support |

**Why one-time (not subscription):**
- Phantom charges $15-20/month = $180-240/year
- Our one-time $49 = 3 months of Phantom
- Users hate subscriptions for tools
- Local processing = no ongoing server costs for us

---

## PLAN STATUS: 🔒 LOCKED

No more architecture changes. Execute this plan.

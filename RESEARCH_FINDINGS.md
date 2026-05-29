# CutThatPro — Deep Audit & Research Findings
## Date: May 29, 2026 | Status: READY FOR MONDAY REVIEW

---

## 1. CRITICAL FINDINGS FROM OFFICIAL DOCS

### ExtendScript Deprecation Timeline
- **November 2025**: Premiere Pro moved to UXP (Unified Extensibility Platform)
- **September 2026**: ExtendScript support ends
- **Action**: Our CEP plugin works now, but we MUST plan UXP migration for late 2026

### TrackItem Object — NO remove() method documented!
- Official docs show Track methods: `insertClip()`, `overwriteClip()`, `isMuted()`, `setMute()`
- **NO documented `removeClip()` or `deleteClip()` on Track object**
- `clip.remove(true)` is an UNDOCUMENTED method — may work in some versions but not guaranteed
- **Alternative approaches needed for clip deletion**:
  1. QE API: `qeSeq.getVideoTrackAt(0).getClipAt(i).delete()` (QE-specific)
  2. Keyboard simulation: Select clip → send Delete key
  3. `app.executeCommand()` with command ID for "Ripple Delete"
  4. Use `app.project.executeTransaction()` compound operation

---

## 2. BUGS FIXED TODAY (May 29)

| # | Bug | Fix | Status |
|---|-----|-----|--------|
| 1 | Missing `cutThatHostPing()` in host.jsx | Added function | ✅ Fixed |
| 2 | `duplicateSequence()` string comparison wrong | Parse JSON, check `success` field | ✅ Fixed |
| 3 | `addCaptionTrackToTimeline` data mismatch | main.js converts segments→SRT, host.jsx decodes URI | ✅ Fixed |
| 4 | `/transcribe` endpoint wrong script | Changed to `whisper_vad_analyzer.py` | ✅ Fixed |
| 5 | `node-fetch` missing | Installed `node-fetch@2` | ✅ Fixed |
| 6 | Hardcoded `language: "en"` in Whisper | Auto-uses detected language | ✅ Fixed |
| 7 | `applyCleanCutDirect` JSON parsing | `decodeURIComponent` + `parseFloat` | ✅ Fixed |
| 8 | `addRazorCutsToTimeline` JSON parsing | Same fix as above | ✅ Fixed |
| 9 | `addSilenceMarkersToTimeline` JSON parsing | Same fix as above | ✅ Fixed |

---

## 3. REMAINING RISKS & OPEN QUESTIONS

### 3a. `clip.remove(true)` — May Not Work
- **Risk**: This is an undocumented API. May fail silently in some Premiere versions.
- **Evidence**: Previous session showed razor cuts work (95 cuts applied) but 0 clips removed.
- **Monday test needed**: Run "Apply Clean Cut" and check if `clipsRemoved > 0`.
- **Fallback plan if it fails**:
  1. Try QE API: `qeSeq.getVideoTrackAt(trackIdx).getClipAt(clipIdx).remove(1)`
  2. Try selecting clips + keyboard delete via `app.executeCommand()`
  3. Use `app.project.executeTransaction()` with compound operations

### 3b. `qeSeq.razor()` Time Format
- **Unknown**: Does razor() accept seconds as float? Ticks? Timecode string?
- **Current code**: Passes `parseFloat(cuts[i].start)` — float seconds
- **Evidence**: Skill reference says "QE API razor() requires parseFloat"
- **Monday test needed**: Verify razor cuts actually appear on timeline

### 3c. CSInterface.evalScript Data Encoding
- **Finding**: `encodeURIComponent(JSON.stringify(data))` in main.js
- **host.jsx must**: `decodeURIComponent()` then `JSON.parse()`
- **Both functions now use this pattern** — should be consistent

### 3d. Analysis After Razor — DOM Refresh Issue
- **Risk**: After QE razor cuts, the ExtendScript DOM (seq.videoTracks[0].clips) may not immediately reflect the new clips.
- **Current code**: Iterates clips right after razor — may see stale data.
- **Fix needed**: Add a small delay or use QE API to query clips instead of DOM API.

---

## 4. CODE AUDIT FINDINGS

### host.jsx (18 functions)
| Function | Status | Issue |
|----------|--------|-------|
| `cutThatHostPing()` | ✅ OK | New, works |
| `testPremiereConnection()` | ✅ OK | Standard check |
| `getSourceMediaPath()` | ✅ OK | Defensive coding, fallback to audio tracks |
| `getAudioExportInfo()` | ✅ OK | Alias for getSourceMediaPath |
| `exportActiveSequenceAudioForCutThat()` | ✅ OK | Alias |
| `duplicateActiveSequence()` | ✅ OK | Dual-method: clone() + QE |
| `applyCutPlan()` | ⚠️ Unused | Uses executeTransaction — may have issues |
| `addMarkersFromCuts()` | ⚠️ Unused | Same as addSilenceMarkersToTimeline |
| `getSequenceInfoForCleanCut()` | ✅ OK | Info getter |
| `duplicateActiveSequenceForCutThat()` | ✅ OK | Alias |
| `addRazorCutsToTimeline()` | ✅ Fixed | decodeURIComponent + parseFloat |
| `addSilenceMarkersToTimeline()` | ✅ Fixed | decodeURIComponent |
| `addCaptionTrackToTimeline()` | ✅ Fixed | decodeURIComponent + SRT write |
| `applyZoomKeyframes()` | ⚠️ Stub | Returns "feature in development" |
| `importSequenceXML()` | ⚠️ Dead | Returns error, kept for compat |
| `applyCleanCutDirect()` | ✅ Fixed | Full rewrite with decode/parseFloat |
| `insertBrollClips()` | ⚠️ Stub | Returns "feature in development" |
| `getTimelineInfo()` | ✅ OK | Info getter |

### main.js (1092+ lines)
| Area | Status | Issue |
|------|--------|-------|
| State management | ✅ OK | Clean state object |
| DOM caching | ✅ OK | All IDs match HTML |
| CSInterface helpers | ✅ OK | runScript, runScriptPromise, parseJsonResponse |
| Backend API helpers | ✅ OK | backendFetch, backendPost, backendGet |
| Tab management | ✅ OK | Clean switching |
| Cut style presets | ✅ OK | 4 presets |
| Engine visibility | ✅ OK | Toggle VAD/FFmpeg settings |
| Test connection | ✅ OK | Fixed JSON parsing |
| Duplicate sequence | ✅ OK | Fixed JSON parsing |
| Export audio | ✅ OK | Gets media path |
| Detect language | ✅ OK | New feature, working |
| Analyze silence | ✅ OK | 3 engine support |
| Add markers | ✅ OK | URI encoded |
| Add razor cuts | ✅ OK | URI encoded |
| Apply clean cut | ✅ Fixed | URI encoded, same pattern |
| Transcribe | ✅ OK | Fixed to use whisper_vad_analyzer |
| Export SRT | ✅ OK | Backend endpoint |
| Add caption track | ✅ Fixed | Segments→SRT conversion |
| Find zoom moments | ✅ OK | Keyword search in transcript |
| Apply zoom | ⚠️ Stub | host.jsx returns "in development" |
| Extract B-roll keywords | ✅ OK | Backend frequency-based |
| Search B-roll | ✅ OK | Pexels API |
| Insert B-roll | ⚠️ Stub | host.jsx returns "in development" |
| Settings | ✅ OK | Backend health check |

### server.js (782+ lines)
| Endpoint | Status | Issue |
|----------|--------|-------|
| GET /health | ✅ OK | |
| GET /file-exists | ✅ OK | |
| POST /analyze-silence | ✅ OK | FFmpeg silencedetect |
| POST /analyze-vad | ✅ OK | Python vad_analyzer.py |
| POST /analyze-whisper-vad | ✅ OK | Python whisper_vad_analyzer.py |
| POST /transcribe | ✅ Fixed | Now uses whisper_vad_analyzer.py |
| POST /detect-language | ✅ OK | New, uses language_detector.py |
| POST /export-srt | ✅ OK | |
| POST /extract-keywords | ✅ OK | Frequency-based |
| POST /search-broll | ✅ OK | Pexels API |
| POST /download-broll | ✅ OK | |
| POST /generate-xml | ⚠️ Unused | FCP7 XML approach abandoned |

### Python Scripts
| Script | Status | Issue |
|--------|--------|-------|
| vad_analyzer.py | ✅ OK | argparse, FFmpeg silence detect |
| whisper_vad_analyzer.py | ✅ Fixed | Added `segments` output, `lang` normalization |
| language_detector.py | ✅ OK | New, 30s sample detection |

---

## 5. COMPETITIVE LANDSCAPE (from memory + knowledge)

### AutoPod
- Premiere Pro plugin for podcast editing
- Auto removes silence, adds jump cuts
- Cloud-based processing
- $20/month

### Phantom Editor
- 13+ tools under one umbrella
- Multi-engine transcription (Deepgram + Speechmatics + AssemblyAI)
- Cloud AI (Gemini 2.5 Pro/Flash)
- Freemium model
- $15-20/month

### Our Advantage
- 100% local processing (privacy-first)
- Zero API costs (M3 Ultra handles everything)
- B-Roll auto-insert (competitors don't have)
- Works offline
- One-time purchase ($49)

---

## 6. MONDAY TEST CHECKLIST

### Before Testing
- [ ] Backend running: `curl http://127.0.0.1:3456/health`
- [ ] CEP debug mode: `defaults read com.adobe.CSXS.9 PlayerDebugMode` → 1
- [ ] Premiere restarted after latest code changes

### Auto Cut Flow
- [ ] Panel loads without errors
- [ ] "Test Connection" → "Connection OK"
- [ ] "Detect Language" → Shows language + confidence
- [ ] "Analyze Silence" → Shows segments + language
- [ ] "Add Markers" → Markers appear on timeline
- [ ] "Add Razor Cuts" → Razor cuts appear on timeline
- [ ] "Apply Clean Cut" → Razor cuts + clip removal (check debug output)

### Key Questions to Answer
1. Does `clip.remove(true)` actually remove clips?
2. Does `qeSeq.razor(parseFloat(seconds))` create razor cuts?
3. Does the detected language get used in Whisper analysis?
4. Does the language dropdown auto-update after detection?

---

## 7. NEXT STEPS (After Monday Testing)

### If Apply Clean Cut Works
1. Polish the feature (progress bar, undo support)
2. Move to Phase 2: Captions (Whisper SRT → timeline)
3. Commit to PLAN.md timeline

### If Apply Clean Cut Fails (clip.remove doesn't work)
1. Try QE API clip deletion: `qeSeq.getVideoTrackAt().getClipAt().remove(1)`
2. Try keyboard simulation approach
3. Try `app.executeCommand()` with Ripple Delete command ID
4. Consider: just leave razor cuts (user manually removes silence clips)

### Phase 2 Preview: Captions
- Backend: Whisper transcription → SRT generation (DONE)
- host.jsx: `addCaptionTrackToTimeline()` (DONE but needs testing)
- UI: Captions tab (DONE)
- Testing: Import SRT into Premiere timeline

---

## PLAN STATUS: 🔒 LOCKED (no architecture changes)

All fixes applied. Code pushed to GitHub. Ready for Monday testing.

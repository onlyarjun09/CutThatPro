# CutThat Pro — Premiere Pro CEP Plugin Spec

## Architecture
- CEP panel (HTML/CSS/JS) → CSInterface → host.jsx (ExtendScript) → Premiere Pro DOM
- Node.js backend (Express :3456) → FFmpeg + Whisper for audio analysis
- Panel fetches backend API for silence detection, transcription

## Features (5 tabs)
1. **Auto Cut** — Silence removal via FFmpeg silencedetect, ripple delete via ExtendScript
2. **Captions** — Whisper transcription → SRT → Premiere caption track
3. **Zoom** — Keyword-based zoom moments → scale keyframes
4. **B-Roll** — LLM extracts keywords → Pexels API search → auto-insert
5. **Settings** — Threshold, API keys, detection engine selector

## Key Technical Requirements
- host.jsx must use QE (Quality Engineering) engine for timeline manipulation
- Audio export via app.encoder.encodeSequence() with .epr preset
- All evalScript calls must be ASYNC (callback-based, not blocking)
- FFmpeg path: /opt/homebrew/bin/ffmpeg
- Whisper: faster-whisper Python library
- Backend: Express server on 127.0.0.1:3456
- CEF flags: --enable-nodejs --mixed-context --allow-file-access

## Premiere API Patterns
- seq.clone() for sequence duplication before cuts
- qe.project for low-level timeline access
- JSON.stringify() for ExtendScript → JS data bridge
- try/catch in every ExtendScript function
- typeof app === "undefined" guard checks

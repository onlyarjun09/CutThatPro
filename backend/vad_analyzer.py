#!/usr/bin/env python3
"""CutThat Pro — Whisper Transcription + VAD Analyzer"""
import sys
import json
import os
import tempfile

def transcribe_with_faster_whisper(audio_path, model_size="base", language=None):
    """Transcribe audio using faster-whisper"""
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="auto", compute_type="auto")
        segments, info = model.transcribe(audio_path, language=language, vad_filter=True)
        
        result = {
            "text": "",
            "segments": [],
            "language": info.language,
            "duration": info.duration
        }
        
        full_text = []
        for seg in segments:
            result["segments"].append({
                "id": seg.id,
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "avg_logprob": round(seg.avg_logprob, 4),
                "no_speech_prob": round(seg.no_speech_prob, 4)
            })
            full_text.append(seg.text.strip())
        
        result["text"] = " ".join(full_text)
        return result
    except ImportError:
        return {"error": "faster-whisper not installed. Run: pip3 install faster-whisper"}
    except Exception as e:
        return {"error": str(e)}

def transcribe_with_openai_whisper(audio_path, model_size="base"):
    """Transcribe audio using openai-whisper"""
    try:
        import whisper
        model = whisper.load_model(model_size)
        result = model.transcribe(audio_path, verbose=False)
        
        output = {
            "text": result["text"],
            "segments": [],
            "language": result.get("language", "unknown")
        }
        
        for seg in result["segments"]:
            output["segments"].append({
                "id": seg["id"],
                "start": round(seg["start"], 3),
                "end": round(seg["end"], 3),
                "text": seg["text"].strip()
            })
        
        return output
    except ImportError:
        return {"error": "openai-whisper not installed. Run: pip3 install openai-whisper"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 vad_analyzer.py <audio_path> [model_size] [engine]"}))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"
    engine = sys.argv[3] if len(sys.argv) > 3 else "faster-whisper"
    
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}"}))
        sys.exit(1)
    
    if engine == "faster-whisper":
        result = transcribe_with_faster_whisper(audio_path, model_size)
    else:
        result = transcribe_with_openai_whisper(audio_path, model_size)
    
    print(json.dumps(result))

#!/usr/bin/env python3
"""CutThat Pro — Language Detector
Detects the language of audio/video media using faster-whisper.
Returns detected language code, name, and confidence.
"""
import sys
import json
import os
import subprocess
import argparse
import tempfile

FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg"

# ISO 639-1 to human-readable language names
LANGUAGE_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "pt": "Portuguese", "nl": "Dutch", "ru": "Russian",
    "zh": "Chinese", "ja": "Japanese", "ko": "Korean", "ar": "Arabic",
    "hi": "Hindi", "bn": "Bengali", "pa": "Punjabi", "ta": "Tamil",
    "te": "Telugu", "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada",
    "ml": "Malayalam", "ur": "Urdu", "tr": "Turkish", "vi": "Vietnamese",
    "th": "Thai", "pl": "Polish", "uk": "Ukrainian", "ro": "Romanian",
    "cs": "Czech", "sv": "Swedish", "da": "Danish", "fi": "Finnish",
    "no": "Norwegian", "el": "Greek", "he": "Hebrew", "hu": "Hungarian",
    "id": "Indonesian", "ms": "Malay", "fil": "Filipino", "bg": "Bulgarian",
    "hr": "Croatian", "sk": "Slovak", "sr": "Serbian", "ca": "Catalan",
    "lt": "Lithuanian", "lv": "Latvian", "et": "Estonian", "sl": "Slovenian",
}


def extract_audio_sample(video_path, output_path=None, max_duration=30):
    """Extract a short audio sample for fast language detection"""
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav")

    cmd = [
        FFMPEG_PATH, "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        "-t", str(max_duration),  # Only first 30 seconds for speed
        output_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            return None, f"FFmpeg error: {result.stderr[:500]}"
        return output_path, None
    except Exception as e:
        return None, str(e)


def detect_language(audio_path, model_size="base"):
    """Detect language using faster-whisper"""
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="auto", compute_type="auto")
        # Use only first 30s for detection (much faster)
        segments, info = model.transcribe(audio_path, vad_filter=True)

        # Consume first few segments to get language detection
        segment_list = []
        for seg in segments:
            segment_list.append({
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip()
            })
            # Only need first few segments for language detection
            if len(segment_list) >= 3:
                break

        detected_lang = info.language
        lang_probability = round(info.language_probability, 4)
        duration = round(info.duration, 2)
        lang_name = LANGUAGE_NAMES.get(detected_lang, detected_lang)

        return {
            "success": True,
            "language": detected_lang,
            "languageName": lang_name,
            "probability": lang_probability,
            "duration": duration,
            "sampleSegments": segment_list,
            "model": model_size
        }, None

    except ImportError:
        return None, "faster-whisper not installed. Run: pip3 install faster-whisper"
    except Exception as e:
        return None, str(e)


def main():
    parser = argparse.ArgumentParser(description="Language Detector")
    parser.add_argument("--filePath", required=True, help="Path to audio/video file")
    parser.add_argument("--modelSize", default="base", help="Whisper model size (tiny/base/small)")
    parser.add_argument("--maxDuration", type=int, default=30, help="Max seconds to analyze")

    args = parser.parse_args()

    if not os.path.exists(args.filePath):
        print(json.dumps({"success": False, "error": f"File not found: {args.filePath}"}))
        sys.exit(1)

    # Check if video — extract audio sample
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.mxf', '.m4v', '.webm', '.flv'}
    _, ext = os.path.splitext(args.filePath.lower())

    audio_path = args.filePath
    temp_audio = None

    if ext in video_exts:
        audio_path, error = extract_audio_sample(args.filePath, max_duration=args.maxDuration)
        if error:
            print(json.dumps({"success": False, "error": f"Audio extraction failed: {error}"}))
            sys.exit(1)
        temp_audio = audio_path

    try:
        result, error = detect_language(audio_path, args.modelSize)

        if error:
            print(json.dumps({"success": False, "error": error}))
            sys.exit(1)

        print(json.dumps(result))

    finally:
        if temp_audio and os.path.exists(temp_audio):
            try:
                os.remove(temp_audio)
            except:
                pass


if __name__ == "__main__":
    main()

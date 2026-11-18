"""Small static Playground server with a Gemini proxy.

Set GEMINI_API_KEY before starting this server. The key stays on the server and
is never sent to the browser.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CHAT_MODEL = os.environ.get(
    "GEMINI_CHAT_MODEL",
    os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"),
)
LESSON_MODEL = os.environ.get("GEMINI_LESSON_MODEL", "gemini-3.6-flash")


class PlaygroundHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self) -> None:
        if self.path != "/api/gemini":
            self.send_error(404)
            return

        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            self._send_json(503, {"error": "GEMINI_API_KEY is not set"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length).decode("utf-8"))
            prompt = str(request.get("prompt", "")).strip()
            json_mode = bool(request.get("json"))
            stream = request.get("stream") is True
            task = "lesson" if request.get("task") == "lesson" else "chat"
            model = LESSON_MODEL if task == "lesson" else CHAT_MODEL
            if not prompt:
                self._send_json(400, {"error": "prompt is required"})
                return
            if len(prompt) > 16000:
                self._send_json(413, {"error": "prompt is too long"})
                return

            payload: dict[str, object] = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "maxOutputTokens": 4096 if task == "lesson" else 1200
                },
            }
            if task == "lesson":
                payload["generationConfig"]["thinkingConfig"] = {
                    "thinkingLevel": "low"
                }
                payload["generationConfig"]["responseMimeType"] = "application/json"
                payload["generationConfig"]["responseJsonSchema"] = {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "intro": {"type": "string"},
                        "goal": {"type": "string"},
                        "starter": {"type": "string"},
                        "solution": {"type": "string"},
                        "hints": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 2,
                            "maxItems": 2,
                        },
                        "mood": {
                            "type": "string",
                            "enum": [
                                "neutral",
                                "happy",
                                "thinking",
                                "encourage",
                                "surprised",
                            ],
                        },
                    },
                    "required": [
                        "title",
                        "intro",
                        "goal",
                        "starter",
                        "solution",
                        "hints",
                        "mood",
                    ],
                    "additionalProperties": False,
                }
            elif json_mode:
                payload["generationConfig"]["responseMimeType"] = "application/json"

            candidates = [model]
            if task == "lesson" and model != CHAT_MODEL:
                candidates.append(CHAT_MODEL)
            for index, candidate_model in enumerate(candidates):
                url = (
                    "https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{candidate_model}:"
                    + (
                        "streamGenerateContent?alt=sse"
                        if stream
                        else "generateContent"
                    )
                )
                gemini_request = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": api_key,
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(
                        gemini_request, timeout=30
                    ) as response:
                        if stream:
                            self.send_response(200)
                            self.send_header(
                                "Content-Type", "text/event-stream; charset=utf-8"
                            )
                            self.send_header("Cache-Control", "no-cache")
                            self.send_header("X-Accel-Buffering", "no")
                            self.end_headers()
                            while chunk := response.read1(4096):
                                self.wfile.write(chunk)
                                self.wfile.flush()
                            return
                        gemini_payload = json.loads(
                            response.read().decode("utf-8")
                        )
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code == 429 and index < len(candidates) - 1:
                        continue
                    raise

            parts = (
                gemini_payload.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [])
            )
            text = "".join(str(part.get("text", "")) for part in parts).strip()
            self._send_json(200, {"text": text})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            self._send_json(exc.code, {"error": detail})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), PlaygroundHandler)
    print(f"PopCorn Playground: http://127.0.0.1:{port}")
    if not os.environ.get("GEMINI_API_KEY"):
        print("GEMINI_API_KEY is not set. Gemini tutor replies will use fallbacks.")
    server.serve_forever()


if __name__ == "__main__":
    main()

"""Ask / AskJson のテスト。本物の AI には送らず、手元の小さな HTTP サーバーに向ける。"""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from tests.test_evaluator import expect_error, run_code

MODEL_ENV = "POPCORN_AI_MODEL"


class _Server:
    def __init__(self, reply, status=200):
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                outer.requests.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": json.loads(self.rfile.read(length))})
                payload = json.dumps(reply).encode("utf-8") if not isinstance(reply, bytes) else reply
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        self.httpd = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}/v1/chat"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture
def ai(monkeypatch):
    servers = []

    def start(reply, status=200, protocol="openai", key="secret-key"):
        server = _Server(reply, status)
        servers.append(server)
        monkeypatch.setenv("POPCORN_AI_URL", server.url)
        monkeypatch.setenv("POPCORN_AI_PROTOCOL", protocol)
        monkeypatch.setenv(MODEL_ENV, "test-model")
        if key:
            monkeypatch.setenv("POPCORN_AI_KEY", key)
        else:
            monkeypatch.delenv("POPCORN_AI_KEY", raising=False)
        return server

    yield start
    for server in servers:
        server.close()


def openai_reply(text):
    return {"choices": [{"message": {"role": "assistant", "content": text}}]}


def test_ask_speaks_the_openai_shape_by_default(ai):
    server = ai(openai_reply("こんにちは"))
    assert run_code('"hi" >> Ask.') == "こんにちは"
    request = server.requests[0]
    assert request["headers"]["authorization"] == "Bearer secret-key"
    assert request["body"]["model"] == "test-model"
    assert request["body"]["messages"] == [{"role": "user", "content": "hi"}]


def test_options_are_sent(ai):
    server = ai(openai_reply("ok"))
    run_code('("hi", {"system": "be short", "model": "other", "temperature": 0.2, "max_tokens": 50}) >> Ask.')
    body = server.requests[0]["body"]
    assert body["model"] == "other"
    assert body["messages"][0] == {"role": "system", "content": "be short"}
    assert body["temperature"] == 0.2
    assert body["max_tokens"] == 50


def test_anthropic_protocol_is_supported(ai):
    server = ai({"content": [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]}, protocol="anthropic")
    assert run_code('("hi", {"system": "s"}) >> Ask.') == "ab"
    request = server.requests[0]
    assert request["headers"]["x-api-key"] == "secret-key"
    assert "authorization" not in request["headers"]
    assert request["body"]["system"] == "s"
    assert request["body"]["messages"] == [{"role": "user", "content": "hi"}]


def test_no_key_means_no_auth_header(ai):
    server = ai(openai_reply("ok"), key=None)
    run_code('"hi" >> Ask.')
    assert "authorization" not in server.requests[0]["headers"]


def test_ask_json_returns_popcorn_values(ai):
    server = ai(openai_reply('```json\n{"color": "red", "n": [1, 2]}\n```'))
    assert run_code('"x" >> AskJson >> Get("color").') == "red"
    assert "JSON" in server.requests[0]["body"]["messages"][0]["content"]


def test_ask_json_rejects_text_that_is_not_json(ai):
    ai(openai_reply("sorry, no"))
    expect_error('"x" >> AskJson.', "RuntimeError")


def test_the_key_never_appears_in_errors(ai):
    ai({"error": "bad"}, status=401)
    exc = expect_error('"hi" >> Ask.', "NetworkError")
    assert "401" in str(exc)
    assert "secret-key" not in str(exc)


def test_unexpected_reply_shape_is_a_network_error(ai):
    ai({"unexpected": True})
    expect_error('"hi" >> Ask.', "NetworkError")


def test_missing_settings_are_clear_runtime_errors(monkeypatch):
    for name in ("POPCORN_AI_URL", "POPCORN_AI_KEY", MODEL_ENV, "POPCORN_AI_PROTOCOL"):
        monkeypatch.delenv(name, raising=False)
    assert "POPCORN_AI_URL" in str(expect_error('"hi" >> Ask.', "RuntimeError"))
    monkeypatch.setenv("POPCORN_AI_URL", "http://127.0.0.1:9/")
    assert "POPCORN_AI_MODEL" in str(expect_error('"hi" >> Ask.', "RuntimeError"))
    monkeypatch.setenv(MODEL_ENV, "m")
    monkeypatch.setenv("POPCORN_AI_PROTOCOL", "mystery")
    expect_error('"hi" >> Ask.', "RuntimeError")


def test_unreachable_server_is_a_network_error(monkeypatch):
    monkeypatch.setenv("POPCORN_AI_URL", "http://127.0.0.1:9/")
    monkeypatch.setenv(MODEL_ENV, "m")
    monkeypatch.delenv("POPCORN_AI_PROTOCOL", raising=False)
    expect_error('("hi", {"timeout": 2}) >> Ask.', "NetworkError")


@pytest.mark.parametrize(
    "source",
    ["1 >> Ask.", '("hi", 3) >> Ask.', '("hi", {"colour": 1}) >> Ask.', '("hi", {"temperature": "hot"}) >> Ask.', '("a", {}, 1) >> Ask.'],
)
def test_bad_input_is_a_type_error(source, monkeypatch):
    monkeypatch.setenv("POPCORN_AI_URL", "http://127.0.0.1:9/")
    monkeypatch.setenv(MODEL_ENV, "m")
    expect_error(source, "TypeError")


def test_the_browser_playground_says_it_is_not_available_yet(monkeypatch):
    monkeypatch.setattr("sys.platform", "emscripten")
    assert "browser Playground" in str(expect_error('"hi" >> Ask.', "RuntimeError"))

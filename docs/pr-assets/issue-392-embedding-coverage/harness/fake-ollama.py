"""fake-ollama.py <port file> <mode> [seconds per vector]: an Ollama embedding API stand-in on 127.0.0.1.

ok: GET lists the model, POST /api/embed answers an 8-dimensional vector.
missing: GET lists the model, so Mnemon takes the service as available, but POST answers 404, as for a model not pulled.
slow: ok, after waiting the given seconds per vector (0.3 by default).
The number of vectors asked for is kept in <port file>.count.
"""
import hashlib, json, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT_FILE, MODE = sys.argv[1], sys.argv[2]
DELAY = float(sys.argv[3]) if len(sys.argv) > 3 else 0.3
lock = threading.Lock()
asked = 0


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200, {'models': [{'name': 'nomic-embed-text'}, {'name': 'nomic-embed-text:latest'}]})

    def do_POST(self):
        global asked
        payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))) or b'{}')
        with lock:
            asked += 1
            with open(PORT_FILE + '.count', 'w') as f:
                f.write(str(asked))
        if MODE == 'missing':
            self.reply(404, {'error': 'model "nomic-embed-text" not found, try pulling it first'})
            return
        if MODE == 'slow':
            time.sleep(DELAY)
        text = payload.get('input', '')
        text = ' '.join(text) if isinstance(text, list) else str(text)
        vector = [0.01] + [0.0] * 7
        for word in set(text.lower().split()):
            vector[hashlib.sha256(word.encode()).digest()[0] % 8] += 1.0
        self.reply(200, {'embeddings': [vector]})


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
with open(PORT_FILE, 'w') as f:
    f.write(str(server.server_address[1]))
server.serve_forever()

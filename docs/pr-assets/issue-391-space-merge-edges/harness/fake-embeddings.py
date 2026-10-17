"""fake-embeddings.py <port file>: a stand-in for Ollama's embedding API on 127.0.0.1.

Answers GET /api/tags and POST /api/embed with a deterministic 8-dimensional vector, binds a free port and writes it to the file.
"""
import hashlib, json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, body):
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply({'models': [{'name': 'nomic-embed-text'}]})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        text = json.loads(self.rfile.read(length) or b'{}').get('input', '')
        # Similar texts get similar vectors: one dimension per hashed word bucket.
        vec = [0.0] * 8
        for word in set(text.lower().split()):
            vec[hashlib.sha256(word.encode()).digest()[0] % 8] += 1.0
        self.reply({'embeddings': [vec]})


server = HTTPServer(('127.0.0.1', 0), Handler)
with open(sys.argv[1], 'w') as f:
    f.write(str(server.server_address[1]))
server.serve_forever()

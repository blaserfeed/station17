"""Entry point for the backend bundled with the desktop window."""
import argparse
from pathlib import Path
import secrets

from backend.server import GameServer

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    args = parser.parse_args()
    args.data_dir.mkdir(parents=True, exist_ok=True)
    key = args.data_dir / "game.secret"
    try:
        with key.open("xb") as file:
            file.write(secrets.token_bytes(32))
    except FileExistsError:
        pass
    with GameServer(("127.0.0.1", 18765), args.data_dir / "game.sqlite3", key.read_bytes()) as server:
        print("READY", flush=True)
        server.serve_forever()

if __name__ == "__main__":
    main()

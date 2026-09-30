"""CLI entry point: `python -m intern_radar_ml <command>`."""

from __future__ import annotations

import argparse
import sys

from .client import ConvexClient


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="intern_radar_ml")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("embed", help="embed pending listings and resumes")
    args = parser.parse_args(argv)

    client = ConvexClient.from_env()
    if args.command == "embed":
        from .embed import run_embed

        pushed = run_embed(client)
        print(f"embed: done, {pushed} records pushed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

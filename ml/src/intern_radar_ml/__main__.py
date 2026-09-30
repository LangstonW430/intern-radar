"""CLI entry point: `python -m intern_radar_ml <command>`."""

from __future__ import annotations

import argparse
import sys

from .client import ConvexClient


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="intern_radar_ml")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("embed", help="embed pending listings and resumes")
    sub.add_parser("jd", help="fetch pending job descriptions")
    sub.add_parser("train", help="train and push a model version")
    args = parser.parse_args(argv)

    client = ConvexClient.from_env()
    if args.command == "embed":
        from .embed import run_embed

        pushed = run_embed(client)
        print(f"embed: done, {pushed} records pushed")
    elif args.command == "jd":
        from .jd.fetch import run_jd_fetch

        counts = run_jd_fetch(client)
        print(f"jd: done, {counts}")
    elif args.command == "train":
        from .train import run_training

        try:
            run_training(client)
        except ValueError as err:
            # Not enough labels yet — a normal state, not a failure.
            print(f"train: skipped ({err})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

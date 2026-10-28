"""Evalua los tres modelos sobre datos sinteticos reproducibles y muestra las metricas.

    python -m app.evaluate --seed 42 --weeks 104
"""

from __future__ import annotations

import argparse
import json
from datetime import date

from . import anomalies, demand, segmentation
from .synthetic import generate


def run(seed: int, weeks: int, customers: int, end_week: date) -> dict:
    data = generate(seed, weeks, customers, end_week=end_week)
    d = demand.train(data.sales, seed).metrics
    s = segmentation.train(data.transactions, data.as_of, seed, data.customer_profiles).metrics
    a = anomalies.detect(data.sales, seed, data.anomalies).metrics
    return {
        "demand": {k: d[k] for k in ("rows", "series", "weeks", "holdout", "baselines", "beatsBaselines", "improvementVsLastWeek")}
        | {"cv": d["crossValidation"]["mean"], "cvStd": d["crossValidation"]["std"], "top5Features": d["featureImportance"][:5]},
        "segmentation": {k: v for k, v in s.items() if k not in ("features", "preprocessing")},
        "anomalies": a,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--weeks", type=int, default=104)
    parser.add_argument("--customers", type=int, default=400)
    parser.add_argument("--end-week", type=date.fromisoformat, default=date(2026, 10, 19))
    args = parser.parse_args()
    print(json.dumps(run(args.seed, args.weeks, args.customers, args.end_week), indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

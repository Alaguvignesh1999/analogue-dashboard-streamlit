from __future__ import annotations

import math


def _valid(values: list[float]) -> list[float]:
    return [value for value in values if not math.isnan(value) and math.isfinite(value)]


def nan_mean(values: list[float]) -> float:
    valid = _valid(values)
    return math.nan if not valid else sum(valid) / len(valid)


def nan_median(values: list[float]) -> float:
    valid = sorted(_valid(values))
    if not valid:
        return math.nan
    mid = len(valid) // 2
    return valid[mid] if len(valid) % 2 else (valid[mid - 1] + valid[mid]) / 2


def nan_std(values: list[float]) -> float:
    valid = _valid(values)
    if len(valid) < 2:
        return 0.0
    mean = nan_mean(valid)
    variance = sum((value - mean) ** 2 for value in valid) / len(valid)
    return math.sqrt(variance)


def nan_percentile(values: list[float], pct: float) -> float:
    valid = sorted(_valid(values))
    if not valid:
        return math.nan
    index = (pct / 100) * (len(valid) - 1)
    low = math.floor(index)
    high = math.ceil(index)
    if low == high:
        return valid[low]
    return valid[low] + (valid[high] - valid[low]) * (index - low)


def nan_min(values: list[float]) -> float:
    valid = _valid(values)
    return math.nan if not valid else min(valid)


def nan_max(values: list[float]) -> float:
    valid = _valid(values)
    return math.nan if not valid else max(valid)


def norm(values: list[float]) -> float:
    return math.sqrt(sum(value * value for value in values))


def dot_product(a: list[float], b: list[float]) -> float:
    return sum(left * right for left, right in zip(a, b))


def cosine(a: list[float], b: list[float]) -> float:
    valid_a: list[float] = []
    valid_b: list[float] = []
    for left, right in zip(a, b):
        if not math.isnan(left) and not math.isnan(right):
            valid_a.append(left)
            valid_b.append(right)
    if len(valid_a) < 2:
        return 0.0
    denom = norm(valid_a) * norm(valid_b)
    return dot_product(valid_a, valid_b) / denom if denom > 0 else 0.0


def corrcoef(a: list[float], b: list[float]) -> float:
    if len(a) < 3 or len(b) < 3:
        return math.nan
    mean_a = nan_mean(a)
    mean_b = nan_mean(b)
    num = 0.0
    den_a = 0.0
    den_b = 0.0
    for left, right in zip(a, b):
        da = left - mean_a
        db = right - mean_b
        num += da * db
        den_a += da * da
        den_b += db * db
    denom = math.sqrt(den_a) * math.sqrt(den_b)
    return num / denom if denom > 0 else math.nan

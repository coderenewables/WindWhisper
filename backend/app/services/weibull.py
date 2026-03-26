from __future__ import annotations

import math

import numpy as np
from scipy import optimize, special, stats


STANDARD_AIR_DENSITY = 1.225


def weibull_pdf(x: np.ndarray, k: float, A: float) -> np.ndarray:
    values = np.asarray(x, dtype=float)
    pdf = np.zeros_like(values)
    if k <= 0 or A <= 0:
        return pdf

    mask = values >= 0
    if not np.any(mask):
        return pdf

    scaled = values[mask] / A
    pdf[mask] = (k / A) * np.power(scaled, k - 1.0) * np.exp(-np.power(scaled, k))
    return pdf


def weibull_cdf(x: np.ndarray, k: float, A: float) -> np.ndarray:
    values = np.asarray(x, dtype=float)
    cdf = np.zeros_like(values)
    if k <= 0 or A <= 0:
        return cdf

    mask = values >= 0
    if not np.any(mask):
        return cdf

    scaled = values[mask] / A
    cdf[mask] = 1.0 - np.exp(-np.power(scaled, k))
    return cdf


def _clean_speeds(speeds: np.ndarray) -> np.ndarray:
    values = np.asarray(speeds, dtype=float)
    values = values[np.isfinite(values)]
    return values[values > 0.0]


def _solve_moments_shape(mean_speed: float, std_speed: float) -> float:
    if mean_speed <= 0:
        raise ValueError("mean_speed must be positive")

    if std_speed <= 0:
        return 20.0

    target_cv = std_speed / mean_speed

    def objective(shape: float) -> float:
        gamma_1 = float(special.gamma(1.0 + 1.0 / shape))
        gamma_2 = float(special.gamma(1.0 + 2.0 / shape))
        model_cv = math.sqrt(max(gamma_2 - gamma_1**2, 0.0)) / gamma_1
        return model_cv - target_cv

    lower_bound = 0.2
    upper_bound = 20.0
    lower_value = objective(lower_bound)
    upper_value = objective(upper_bound)

    if lower_value == 0:
        return lower_bound
    if upper_value == 0:
        return upper_bound

    if lower_value * upper_value > 0:
        return max(0.5, min(20.0, target_cv**-1.086))

    return float(optimize.brentq(objective, lower_bound, upper_bound, maxiter=200))


def _fit_mle(values: np.ndarray) -> tuple[float, float]:
    shape, _, scale = stats.weibull_min.fit(values, floc=0)
    return float(shape), float(scale)


def _fit_moments(values: np.ndarray) -> tuple[float, float]:
    mean_speed = float(np.mean(values))
    std_speed = float(np.std(values, ddof=0))
    shape = _solve_moments_shape(mean_speed, std_speed)
    scale = mean_speed / float(special.gamma(1.0 + 1.0 / shape))
    return float(shape), float(scale)


def _fit_quality(values: np.ndarray, k: float, A: float) -> tuple[float, float, float]:
    sorted_values = np.sort(values)
    empirical = np.arange(1, len(sorted_values) + 1, dtype=float) / float(len(sorted_values))
    fitted = weibull_cdf(sorted_values, k, A)
    residuals = empirical - fitted
    rmse = float(math.sqrt(np.mean(np.square(residuals))))
    centered = empirical - float(np.mean(empirical))
    denominator = float(np.sum(np.square(centered)))
    r_squared = 1.0 - float(np.sum(np.square(residuals))) / denominator if denominator > 0 else 1.0
    ks_stat = float(np.max(np.abs(residuals)))
    return r_squared, rmse, ks_stat


def fit_weibull(speeds: np.ndarray, method: str = "mle") -> dict[str, float | str]:
    values = _clean_speeds(speeds)
    if len(values) < 2:
        raise ValueError("At least two positive wind speed samples are required to fit a Weibull distribution")

    if method == "moments":
        k, A = _fit_moments(values)
    else:
        k, A = _fit_mle(values)
        method = "mle"

    r_squared, rmse, ks_stat = _fit_quality(values, k, A)
    mean_speed = A * float(special.gamma(1.0 + 1.0 / k))
    mean_cubed_speed = (A**3) * float(special.gamma(1.0 + 3.0 / k))
    mean_power_density = 0.5 * STANDARD_AIR_DENSITY * mean_cubed_speed

    return {
        "method": method,
        "k": float(k),
        "A": float(A),
        "mean_speed": float(mean_speed),
        "mean_power_density": float(mean_power_density),
        "r_squared": float(r_squared),
        "rmse": float(rmse),
        "ks_stat": float(ks_stat),
    }
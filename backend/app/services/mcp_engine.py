from __future__ import annotations

import math
from collections.abc import Iterable

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from app.services.weibull import fit_weibull


SUPPORTED_MCP_METHODS = ("linear", "variance_ratio", "matrix")


def _coerce_series(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce").astype(float)
    values = values.replace([np.inf, -np.inf], np.nan).dropna()
    return values.sort_index()


def _coerce_series_preserve_nans(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce").astype(float)
    values = values.replace([np.inf, -np.inf], np.nan)
    return values.sort_index()


def _coerce_frame(series_by_name: dict[str, pd.Series]) -> pd.DataFrame:
    if not series_by_name:
        return pd.DataFrame()

    normalized = [
        _coerce_series_preserve_nans(series).rename(name)
        for name, series in series_by_name.items()
    ]
    return pd.concat(normalized, axis=1, join="outer").sort_index()


def _require_minimum_samples(site: pd.Series, ref: pd.Series, minimum: int = 2) -> None:
    if len(site.index) < minimum or len(ref.index) < minimum:
        raise ValueError("At least two concurrent samples are required for MCP")


def _regression_parameters(ref_values: np.ndarray, site_values: np.ndarray) -> tuple[float, float]:
    if ref_values.size < 2:
        raise ValueError("At least two concurrent samples are required for MCP")

    ref_std = float(np.std(ref_values, ddof=0))
    if math.isclose(ref_std, 0.0):
        return 0.0, float(np.mean(site_values))

    slope, intercept = np.polyfit(ref_values, site_values, deg=1)
    return float(slope), float(intercept)


def _build_prediction_series(reference: pd.Series, values: np.ndarray, name: str = "predicted") -> pd.Series:
    predicted = pd.Series(np.nan, index=reference.index, dtype=float, name=name)
    mask = reference.notna().to_numpy(dtype=bool)
    clipped = np.clip(np.asarray(values, dtype=float), a_min=0.0, a_max=None)
    predicted.loc[reference.index[mask]] = clipped[mask]
    return predicted


def _build_prediction_series_from_frame(reference_frame: pd.DataFrame, values: np.ndarray, name: str = "predicted") -> pd.Series:
    predicted = pd.Series(np.nan, index=reference_frame.index, dtype=float, name=name)
    if reference_frame.empty:
        return predicted

    valid_index = reference_frame.dropna().index
    if len(valid_index) == 0:
        return predicted

    clipped = np.clip(np.asarray(values, dtype=float), a_min=0.0, a_max=None)
    predicted.loc[valid_index] = clipped
    return predicted


def _weighted_rmse(residuals: list[np.ndarray]) -> float:
    if not residuals:
        return 0.0
    squared_sum = float(sum(np.sum(np.square(item)) for item in residuals))
    sample_count = int(sum(item.size for item in residuals))
    return float(math.sqrt(squared_sum / sample_count)) if sample_count else 0.0


def _fold_metrics(actual: np.ndarray, predicted: np.ndarray, baseline: np.ndarray, period: str) -> dict[str, float | int | str]:
    residuals = predicted - actual
    baseline_residuals = baseline - actual
    rmse = float(math.sqrt(np.mean(np.square(residuals))))
    baseline_rmse = float(math.sqrt(np.mean(np.square(baseline_residuals))))
    skill_score = 0.0 if math.isclose(baseline_rmse, 0.0) else float(1.0 - (rmse / baseline_rmse))
    return {
        "period": period,
        "sample_count": int(actual.size),
        "rmse": rmse,
        "bias": float(np.mean(residuals)),
        "skill_score": skill_score,
    }


def _matrix_concurrent_frame(target_series: pd.Series, predictor_series_by_name: dict[str, pd.Series]) -> pd.DataFrame:
    target = _coerce_series(target_series).rename("site")
    predictors = _coerce_frame(predictor_series_by_name)
    combined = pd.concat([target, predictors], axis=1, join="inner").dropna()
    return combined.sort_index()


def _train_matrix_model(target_values: pd.Series, predictor_frame: pd.DataFrame) -> LinearRegression:
    if predictor_frame.empty or len(target_values.index) < 2:
        raise ValueError("At least two concurrent samples are required for MCP")

    model = LinearRegression()
    model.fit(predictor_frame.to_numpy(dtype=float), target_values.to_numpy(dtype=float))
    return model


def _fit_single_method(train_frame: pd.DataFrame, test_ref: pd.Series, method: str) -> np.ndarray:
    if method == "linear":
        slope, intercept = _regression_parameters(
            train_frame["ref"].to_numpy(dtype=float),
            train_frame["site"].to_numpy(dtype=float),
        )
        return (test_ref.to_numpy(dtype=float) * slope) + intercept

    if method == "variance_ratio":
        site_values = train_frame["site"].to_numpy(dtype=float)
        ref_values = train_frame["ref"].to_numpy(dtype=float)
        site_mean = float(np.mean(site_values))
        ref_mean = float(np.mean(ref_values))
        site_std = float(np.std(site_values, ddof=0))
        ref_std = float(np.std(ref_values, ddof=0))
        std_ratio = 0.0 if math.isclose(ref_std, 0.0) else float(site_std / ref_std)
        return site_mean + ((test_ref.to_numpy(dtype=float) - ref_mean) * std_ratio)

    raise ValueError(f"Unsupported MCP method: {method}")


def _prediction_stats(actual: pd.Series, predicted: pd.Series, params: dict[str, float]) -> dict[str, float | int | str | None]:
    actual_aligned, predicted_aligned = align_concurrent(actual, predicted)
    _require_minimum_samples(actual_aligned, predicted_aligned)

    actual_values = actual_aligned.to_numpy(dtype=float)
    predicted_values = predicted_aligned.to_numpy(dtype=float)
    residuals = actual_values - predicted_values

    actual_std = float(np.std(actual_values, ddof=0))
    predicted_std = float(np.std(predicted_values, ddof=0))
    pearson_r = 0.0
    if not math.isclose(actual_std, 0.0) and not math.isclose(predicted_std, 0.0):
        pearson_r = float(np.corrcoef(actual_values, predicted_values)[0, 1])

    return {
        "sample_count": int(actual_values.size),
        "pearson_r": pearson_r,
        "r_squared": float(pearson_r**2),
        "rmse": float(math.sqrt(np.mean(np.square(residuals)))),
        "bias": float(np.mean(predicted_values - actual_values)),
        "slope": float(params.get("slope", 0.0)),
        "intercept": float(params.get("intercept", 0.0)),
        "concurrent_start": actual_aligned.index.min().to_pydatetime().isoformat(),
        "concurrent_end": actual_aligned.index.max().to_pydatetime().isoformat(),
    }


def align_concurrent(site_data: pd.Series, ref_data: pd.Series) -> tuple[pd.Series, pd.Series]:
    site_series = _coerce_series(site_data)
    ref_series = _coerce_series(ref_data)
    aligned = pd.concat([site_series.rename("site"), ref_series.rename("ref")], axis=1, join="inner").dropna()
    return aligned["site"], aligned["ref"]


def correlation_stats(site: pd.Series, ref: pd.Series) -> dict[str, float | int | str]:
    site_aligned, ref_aligned = align_concurrent(site, ref)
    _require_minimum_samples(site_aligned, ref_aligned)

    site_values = site_aligned.to_numpy(dtype=float)
    ref_values = ref_aligned.to_numpy(dtype=float)
    slope, intercept = _regression_parameters(ref_values, site_values)
    ref_std = float(np.std(ref_values, ddof=0))
    site_std = float(np.std(site_values, ddof=0))
    pearson_r = 0.0
    if not math.isclose(ref_std, 0.0) and not math.isclose(site_std, 0.0):
        pearson_r = float(np.corrcoef(ref_values, site_values)[0, 1])

    residuals = site_values - ref_values

    return {
        "sample_count": int(site_values.size),
        "pearson_r": pearson_r,
        "r_squared": float(pearson_r**2),
        "rmse": float(math.sqrt(np.mean(np.square(residuals)))),
        "bias": float(np.mean(site_values - ref_values)),
        "slope": slope,
        "intercept": intercept,
        "concurrent_start": site_aligned.index.min().to_pydatetime().isoformat(),
        "concurrent_end": site_aligned.index.max().to_pydatetime().isoformat(),
    }


def mcp_linear_least_squares(site: pd.Series, ref: pd.Series, ref_full: pd.Series) -> dict[str, object]:
    concurrent_site, concurrent_ref = align_concurrent(site, ref)
    _require_minimum_samples(concurrent_site, concurrent_ref)

    ref_values = concurrent_ref.to_numpy(dtype=float)
    site_values = concurrent_site.to_numpy(dtype=float)
    slope, intercept = _regression_parameters(ref_values, site_values)

    ref_full_series = pd.to_numeric(ref_full, errors="coerce").astype(float).sort_index()
    predicted_values = (ref_full_series.fillna(0.0).to_numpy(dtype=float) * slope) + intercept
    predicted_series = _build_prediction_series(ref_full_series, predicted_values)
    concurrent_prediction = predicted_series.reindex(concurrent_ref.index)

    params = {"slope": slope, "intercept": intercept}
    return {
        "method": "linear",
        "predicted_series": predicted_series,
        "params": params,
        "stats": _prediction_stats(concurrent_site, concurrent_prediction, params),
    }


def mcp_variance_ratio(site: pd.Series, ref: pd.Series, ref_full: pd.Series) -> dict[str, object]:
    concurrent_site, concurrent_ref = align_concurrent(site, ref)
    _require_minimum_samples(concurrent_site, concurrent_ref)

    site_values = concurrent_site.to_numpy(dtype=float)
    ref_values = concurrent_ref.to_numpy(dtype=float)

    site_mean = float(np.mean(site_values))
    ref_mean = float(np.mean(ref_values))
    site_std = float(np.std(site_values, ddof=0))
    ref_std = float(np.std(ref_values, ddof=0))
    std_ratio = 0.0 if math.isclose(ref_std, 0.0) else float(site_std / ref_std)
    intercept = site_mean - (std_ratio * ref_mean)

    ref_full_series = pd.to_numeric(ref_full, errors="coerce").astype(float).sort_index()
    predicted_values = site_mean + ((ref_full_series.fillna(0.0).to_numpy(dtype=float) - ref_mean) * std_ratio)
    predicted_series = _build_prediction_series(ref_full_series, predicted_values)
    concurrent_prediction = predicted_series.reindex(concurrent_ref.index)

    params = {
        "slope": std_ratio,
        "intercept": intercept,
        "site_mean": site_mean,
        "ref_mean": ref_mean,
        "std_ratio": std_ratio,
    }
    return {
        "method": "variance_ratio",
        "predicted_series": predicted_series,
        "params": params,
        "stats": _prediction_stats(concurrent_site, concurrent_prediction, params),
    }


def mcp_matrix_method(
    site_columns: dict[str, pd.Series],
    ref_columns: dict[str, pd.Series],
    ref_full: dict[str, pd.Series],
) -> dict[str, object]:
    if not site_columns:
        raise ValueError("At least one site column is required for matrix MCP")
    if not ref_columns:
        raise ValueError("At least one reference column is required for matrix MCP")

    predictor_names = list(ref_columns.keys())
    full_predictor_frame = _coerce_frame(ref_full)
    outputs: dict[str, dict[str, object]] = {}

    for site_name, site_series in site_columns.items():
        concurrent_frame = _matrix_concurrent_frame(site_series, ref_columns)
        if len(concurrent_frame.index) < 2:
            raise ValueError("At least two concurrent samples are required for MCP")

        model = _train_matrix_model(concurrent_frame["site"], concurrent_frame[predictor_names])
        prediction_frame = full_predictor_frame[predictor_names]
        valid_prediction_frame = prediction_frame.dropna()
        predicted_values = model.predict(valid_prediction_frame.to_numpy(dtype=float)) if not valid_prediction_frame.empty else np.array([], dtype=float)
        predicted_series = _build_prediction_series_from_frame(prediction_frame, predicted_values, name=site_name)
        concurrent_prediction = predicted_series.reindex(concurrent_frame.index)

        coefficient_map = {
            f"coefficient_{name}": float(coefficient)
            for name, coefficient in zip(predictor_names, model.coef_, strict=False)
        }
        params = {
            "intercept": float(model.intercept_),
            **coefficient_map,
        }
        primary_slope = float(model.coef_[0]) if len(model.coef_) else 0.0
        stats = _prediction_stats(concurrent_frame["site"], concurrent_prediction, {"slope": primary_slope, "intercept": float(model.intercept_)})

        outputs[site_name] = {
            "predicted_series": predicted_series,
            "params": params,
            "stats": stats,
        }

    return {
        "method": "matrix",
        "outputs": outputs,
    }


def mcp_summary(predicted: pd.Series, method: str) -> dict[str, object]:
    predicted_series = _coerce_series(predicted)
    if predicted_series.empty:
        raise ValueError("Predicted series is empty")

    monthly_means = [
        {
            "month": int(month),
            "mean_speed": float(group.mean()),
            "sample_count": int(group.count()),
        }
        for month, group in predicted_series.groupby(predicted_series.index.month)
    ]
    annual_means = [
        {
            "year": int(year),
            "mean_speed": float(group.mean()),
            "sample_count": int(group.count()),
        }
        for year, group in predicted_series.groupby(predicted_series.index.year)
    ]

    weibull: dict[str, float | str] | None = None
    if predicted_series.count() >= 2 and float(predicted_series.max()) > 0.0:
        weibull = fit_weibull(predicted_series.to_numpy(dtype=float), method="mle")

    return {
        "method": method,
        "sample_count": int(predicted_series.count()),
        "start_time": predicted_series.index.min().to_pydatetime().isoformat(),
        "end_time": predicted_series.index.max().to_pydatetime().isoformat(),
        "long_term_mean_speed": float(predicted_series.mean()),
        "monthly_means": monthly_means,
        "annual_means": annual_means,
        "weibull": weibull,
    }


def cross_validate_mcp(
    site: pd.Series,
    ref: pd.Series,
    ref_full: pd.Series,
    method: str,
    *,
    site_columns: dict[str, pd.Series] | None = None,
    ref_columns: dict[str, pd.Series] | None = None,
    target_site_name: str | None = None,
    folds: str = "monthly",
) -> dict[str, object]:
    if folds != "monthly":
        raise ValueError("Only monthly cross-validation is supported")

    fold_results: list[dict[str, float | int | str]] = []
    fold_residuals: list[np.ndarray] = []

    if method == "matrix":
        if site_columns is None or ref_columns is None or target_site_name is None:
            raise ValueError("Matrix MCP cross-validation requires site_columns, ref_columns, and target_site_name")

        if target_site_name not in site_columns:
            raise ValueError("target_site_name must reference a provided site column")

        concurrent_frame = _matrix_concurrent_frame(site_columns[target_site_name], ref_columns)
        predictor_names = list(ref_columns.keys())
    else:
        concurrent_site, concurrent_ref = align_concurrent(site, ref)
        concurrent_frame = pd.concat([concurrent_site.rename("site"), concurrent_ref.rename("ref")], axis=1)
        predictor_names = ["ref"]

    if concurrent_frame.empty:
        raise ValueError("At least two concurrent samples are required for MCP")

    normalized_index = concurrent_frame.index
    if getattr(normalized_index, "tz", None) is not None:
        normalized_index = normalized_index.tz_convert("UTC").tz_localize(None)
    periods = normalized_index.to_period("M")
    unique_periods = list(periods.unique())
    if len(unique_periods) < 2:
        raise ValueError("Monthly cross-validation requires at least two months of concurrent data")

    for period in unique_periods:
        test_mask = periods == period
        train_frame = concurrent_frame.loc[~test_mask]
        test_frame = concurrent_frame.loc[test_mask]
        if len(train_frame.index) < 2 or test_frame.empty:
            continue

        if method == "matrix":
            model = _train_matrix_model(train_frame["site"], train_frame[predictor_names])
            predicted = model.predict(test_frame[predictor_names].to_numpy(dtype=float))
        else:
            predicted = _fit_single_method(train_frame, test_frame["ref"], method)

        actual = test_frame["site"].to_numpy(dtype=float)
        baseline = np.full(actual.shape, float(train_frame["site"].mean()), dtype=float)
        fold_results.append(_fold_metrics(actual, predicted, baseline, str(period)))
        fold_residuals.append(predicted - actual)

    if not fold_results:
        raise ValueError("Unable to compute monthly cross-validation folds for MCP")

    total_samples = int(sum(int(fold["sample_count"]) for fold in fold_results))
    weighted_bias = float(
        sum(float(fold["bias"]) * int(fold["sample_count"]) for fold in fold_results) / total_samples,
    ) if total_samples else 0.0
    weighted_skill = float(
        sum(float(fold["skill_score"]) * int(fold["sample_count"]) for fold in fold_results) / total_samples,
    ) if total_samples else 0.0
    uncertainty = _weighted_rmse(fold_residuals)

    return {
        "fold_count": len(fold_results),
        "rmse": uncertainty,
        "bias": weighted_bias,
        "skill_score": weighted_skill,
        "uncertainty": uncertainty,
        "folds": fold_results,
    }


def compare_mcp_methods(
    site: pd.Series,
    ref: pd.Series,
    ref_full: pd.Series,
    methods: Iterable[str] = SUPPORTED_MCP_METHODS,
    *,
    site_columns: dict[str, pd.Series] | None = None,
    ref_columns: dict[str, pd.Series] | None = None,
    ref_full_columns: dict[str, pd.Series] | None = None,
    target_site_name: str | None = None,
) -> list[dict[str, object]]:
    method_map = {
        "linear": mcp_linear_least_squares,
        "variance_ratio": mcp_variance_ratio,
        "matrix": mcp_matrix_method,
    }

    comparison_rows: list[dict[str, object]] = []
    for method in methods:
        if method not in method_map:
            raise ValueError(f"Unsupported MCP method: {method}")

        if method == "matrix":
            if site_columns is None or ref_columns is None or ref_full_columns is None:
                raise ValueError("Matrix MCP comparison requires site_columns, ref_columns, and ref_full_columns")
            if target_site_name is None:
                raise ValueError("Matrix MCP comparison requires a target_site_name")
            result = method_map[method](site_columns, ref_columns, ref_full_columns)
            if target_site_name not in result["outputs"]:
                raise ValueError("target_site_name must match a matrix MCP output")
            primary_output = result["outputs"][target_site_name]
            summary = mcp_summary(primary_output["predicted_series"], method)
            stats = primary_output["stats"]
            params = primary_output["params"]
            cross_validation = cross_validate_mcp(
                site,
                ref,
                ref_full,
                method,
                site_columns=site_columns,
                ref_columns=ref_columns,
                target_site_name=target_site_name,
            )
        else:
            result = method_map[method](site, ref, ref_full)
            summary = mcp_summary(result["predicted_series"], method)
            stats = result["stats"]
            params = result["params"]
            cross_validation = cross_validate_mcp(site, ref, ref_full, method)

        comparison_rows.append(
            {
                "method": method,
                "params": params,
                "stats": stats,
                "summary": summary,
                "cross_validation": cross_validation,
                "uncertainty": float(cross_validation["uncertainty"]),
            },
        )

    return sorted(comparison_rows, key=lambda row: (float(row["uncertainty"]), row["method"]))
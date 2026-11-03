# -*- coding: utf-8 -*-
"""
confidence_calibration.py - AI Confidence Calibration & Evaluation Module
==========================================================================
Implements:
  - Temperature Scaling (post-hoc calibration on raw softmax outputs)
  - Expected Calibration Error (ECE)
  - Brier Score
  - Reliability Diagram data generation
  - Validation dataset evaluation pipeline

DESIGN NOTES
------------
* Calibration uses a held-out validation set from stored diagnoses.
  It is NEVER trained on the test set.
* If fewer than MIN_SAMPLES diagnoses are available, calibrated confidence
  is reported as unavailable rather than fabricating a score.
* Classifier confidence and LLM explanation text are kept separate;
  only the classifier probability vector is calibrated.
* A higher confidence score does NOT imply clinical improvement.
"""

import os
import json
import math
import sqlite3
import numpy as np
from datetime import datetime
from PIL import Image

# --- Constants ---------------------------------------------------------------
MIN_SAMPLES          = 10      # minimum diagnoses needed before calibration
N_BINS               = 10      # number of confidence bins for ECE / reliability diagram
DEFAULT_TEMPERATURE  = 1.0     # identity scaling when calibration is unavailable
AI_IMG_SIZE          = 224
MODEL_PATH           = os.path.join(os.path.dirname(__file__), 'dermai_model.h5')
METADATA_PATH        = os.path.join(os.path.dirname(__file__), 'dermai_class_metadata.json')
DATABASE             = 'dermai.db'

# --- Module-level cache ------------------------------------------------------
_calibration_cache = None


# =============================================================================
# 1. TEMPERATURE SCALING
# =============================================================================

def _softmax(logits):
    """Numerically stable softmax over a 1-D array."""
    e = np.exp(logits - np.max(logits))
    return e / e.sum()


def apply_temperature(probs, temperature):
    """
    Divide log-probabilities by temperature and re-normalise.

    Parameters
    ----------
    probs       : np.ndarray shape (n_classes,) - raw softmax output from model
    temperature : float - learned temperature (T >= 1 => smoother)

    Returns
    -------
    np.ndarray : re-calibrated probability vector (sums to 1)
    """
    if temperature <= 0:
        temperature = DEFAULT_TEMPERATURE
    log_probs = np.log(np.clip(probs, 1e-12, 1.0))
    return _softmax(log_probs / temperature)


def _find_optimal_temperature(probs_list, labels_list, t_range=None):
    """
    Grid-search the temperature T that minimises Negative Log-Likelihood (NLL)
    on the validation set.

    Parameters
    ----------
    probs_list  : list of np.ndarray (each shape (n_classes,))
    labels_list : list of int - ground-truth class indices
    t_range     : list of float temperatures to try (default 0.1 to 5.0, step 0.1)

    Returns
    -------
    float : optimal temperature
    """
    if t_range is None:
        t_range = [round(0.1 * i, 1) for i in range(1, 51)]   # 0.1 ... 5.0

    best_T   = DEFAULT_TEMPERATURE
    best_nll = float('inf')

    for T in t_range:
        nll = 0.0
        for probs, label in zip(probs_list, labels_list):
            cal_probs = apply_temperature(probs, T)
            nll -= math.log(max(cal_probs[label], 1e-12))
        if nll < best_nll:
            best_nll = nll
            best_T   = T

    return best_T


# =============================================================================
# 2. CALIBRATION METRICS
# =============================================================================

def compute_ece(probs_list, labels_list, n_bins=N_BINS):
    """
    Expected Calibration Error (ECE).

    For each confidence bin [k/n_bins, (k+1)/n_bins):
        ECE += (|bin| / N) * |avg_confidence(bin) - accuracy(bin)|

    Returns
    -------
    float : ECE in [0, 1] (lower is better)
    """
    n = len(probs_list)
    if n == 0:
        return 0.0

    bins_conf = [[] for _ in range(n_bins)]
    bins_acc  = [[] for _ in range(n_bins)]

    for probs, label in zip(probs_list, labels_list):
        top_idx  = int(np.argmax(probs))
        top_conf = float(probs[top_idx])
        correct  = int(top_idx == label)
        bin_idx  = min(int(top_conf * n_bins), n_bins - 1)
        bins_conf[bin_idx].append(top_conf)
        bins_acc[bin_idx].append(correct)

    ece = 0.0
    for bc, ba in zip(bins_conf, bins_acc):
        if bc:
            avg_conf = sum(bc) / len(bc)
            avg_acc  = sum(ba) / len(ba)
            ece += (len(bc) / n) * abs(avg_conf - avg_acc)

    return round(ece, 4)


def compute_brier_score(probs_list, labels_list, n_classes=7):
    """
    Multi-class Brier Score = mean squared difference between
    predicted probability vector and one-hot ground-truth vector.

    Returns
    -------
    float : Brier score in [0, 2] (lower is better; perfect = 0)
    """
    n = len(probs_list)
    if n == 0:
        return 0.0

    total = 0.0
    for probs, label in zip(probs_list, labels_list):
        one_hot = np.zeros(n_classes)
        one_hot[label] = 1.0
        p = np.array(probs)
        total += float(np.sum((p - one_hot) ** 2))

    return round(total / n, 4)


def compute_reliability_diagram(probs_list, labels_list, n_bins=N_BINS):
    """
    Compute data for a reliability diagram.

    Returns
    -------
    dict with keys:
        'bin_centers' : list of float - midpoint of each bin
        'avg_conf'    : list of float - average confidence per bin
        'avg_acc'     : list of float - average accuracy per bin
        'bin_counts'  : list of int   - number of samples per bin
    """
    bins_conf = [[] for _ in range(n_bins)]
    bins_acc  = [[] for _ in range(n_bins)]

    for probs, label in zip(probs_list, labels_list):
        top_idx  = int(np.argmax(probs))
        top_conf = float(probs[top_idx])
        correct  = int(top_idx == label)
        bin_idx  = min(int(top_conf * n_bins), n_bins - 1)
        bins_conf[bin_idx].append(top_conf)
        bins_acc[bin_idx].append(correct)

    bin_centers = [(i + 0.5) / n_bins for i in range(n_bins)]
    avg_conf    = [round(sum(bc) / len(bc), 4) if bc else round((i + 0.5) / n_bins, 4)
                   for i, bc in enumerate(bins_conf)]
    avg_acc     = [round(sum(ba) / len(ba), 4) if ba else 0.0
                   for ba in bins_acc]
    bin_counts  = [len(bc) for bc in bins_conf]

    return {
        'bin_centers': bin_centers,
        'avg_conf':    avg_conf,
        'avg_acc':     avg_acc,
        'bin_counts':  bin_counts,
    }


# =============================================================================
# 3. PREDICTION HELPER
# =============================================================================

def _get_raw_probs(image_path, model, meta):
    """
    Run model inference and return the raw probability vector (shape: n_classes).
    Returns None on failure.
    """
    try:
        img  = Image.open(image_path).convert('RGB')
        img  = img.resize((AI_IMG_SIZE, AI_IMG_SIZE))
        arr  = np.array(img, dtype=np.float32) / 255.0
        arr  = np.expand_dims(arr, 0)
        import tensorflow as tf
        probs = model.predict(arr, verbose=0)[0]
        return probs
    except Exception as e:
        print("[Calibration] Raw probs error for {}: {}".format(image_path, e))
        return None


# =============================================================================
# 4. CALIBRATION PIPELINE
# =============================================================================

def run_calibration_pipeline(db_path=DATABASE):
    """
    Full calibration evaluation pipeline:
      1. Load all diagnoses that have an image_path and a known disease.
      2. Re-run model inference to get raw probability vectors.
      3. Map disease display name -> class index using metadata.
      4. Split 80/20 into calibration-fit / test sub-sets.
      5. Find optimal temperature on calibration-fit set.
      6. Compute ECE and Brier score before/after on test sub-set.
      7. Build reliability diagram data before/after calibration.
      8. Return a result dict and store in module-level cache.

    Returns
    -------
    dict - calibration results
    """
    global _calibration_cache

    result = {
        'calibrated':     False,
        'temperature':    DEFAULT_TEMPERATURE,
        'ece_before':     None,
        'ece_after':      None,
        'brier_before':   None,
        'brier_after':    None,
        'diagram_before': None,
        'diagram_after':  None,
        'n_samples':      0,
        'eval_date':      datetime.now().strftime('%Y-%m-%d %H:%M'),
        'message':        '',
    }

    # Load model
    try:
        import tensorflow as tf
        model = tf.keras.models.load_model(MODEL_PATH)
        with open(METADATA_PATH, encoding='utf-8') as f:
            meta = json.load(f)
    except Exception as e:
        result['message'] = 'Model unavailable: {}'.format(e)
        _calibration_cache = result
        return result

    # Build reverse map: display_name -> class_idx
    display_to_cls = {v: k for k, v in meta['class_display_names'].items()}
    cls_to_idx     = meta['class_to_idx']

    # Load diagnoses with images from DB
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT image_path, disease FROM diagnoses "
            "WHERE image_path != '' AND disease != '' "
            "AND disease != 'Unknown' AND disease != 'Inconclusive'"
        ).fetchall()
        conn.close()
    except Exception as e:
        result['message'] = 'Database error: {}'.format(e)
        _calibration_cache = result
        return result

    # Build (probs, label) pairs
    probs_all  = []
    labels_all = []

    for row in rows:
        img_path = row['image_path']
        disease  = row['disease']

        cls_key = display_to_cls.get(disease)
        if cls_key is None:
            continue
        label = cls_to_idx.get(cls_key)
        if label is None:
            continue

        # Strip leading slash if stored as /static/...
        if img_path.startswith('/'):
            img_path = img_path[1:]

        if not os.path.isfile(img_path):
            continue

        probs = _get_raw_probs(img_path, model, meta)
        if probs is None:
            continue

        probs_all.append(probs)
        labels_all.append(label)

    n = len(probs_all)
    result['n_samples'] = n

    if n < MIN_SAMPLES:
        result['message'] = (
            'Only {} valid labeled samples available '
            '(minimum {} required). '
            'Calibrated confidence is unavailable.'.format(n, MIN_SAMPLES)
        )
        _calibration_cache = result
        return result

    # Split: 80% calibration-fit / 20% evaluation
    rng       = np.random.default_rng(seed=42)
    indices   = rng.permutation(n)
    split_idx = max(int(n * 0.8), 1)
    cal_idx   = indices[:split_idx]
    test_idx  = indices[split_idx:]

    # Ensure at least 1 sample in test set
    if len(test_idx) == 0:
        test_idx = cal_idx[-1:]
        cal_idx  = cal_idx[:-1]

    probs_cal   = [probs_all[i]  for i in cal_idx]
    labels_cal  = [labels_all[i] for i in cal_idx]
    probs_test  = [probs_all[i]  for i in test_idx]
    labels_test = [labels_all[i] for i in test_idx]

    # Find optimal temperature on calibration-fit set
    temperature = _find_optimal_temperature(probs_cal, labels_cal)

    # Calibrated probs on test set
    probs_test_cal = [apply_temperature(p, temperature) for p in probs_test]

    # Metrics
    ece_before   = compute_ece(probs_test, labels_test)
    ece_after    = compute_ece(probs_test_cal, labels_test)
    brier_before = compute_brier_score(probs_test, labels_test)
    brier_after  = compute_brier_score(probs_test_cal, labels_test)

    # Reliability diagrams
    diag_before = compute_reliability_diagram(probs_test, labels_test)
    diag_after  = compute_reliability_diagram(probs_test_cal, labels_test)

    result.update({
        'calibrated':     True,
        'temperature':    round(temperature, 3),
        'ece_before':     ece_before,
        'ece_after':      ece_after,
        'brier_before':   brier_before,
        'brier_after':    brier_after,
        'diagram_before': diag_before,
        'diagram_after':  diag_after,
        'n_samples':      n,
        'n_test':         len(test_idx),
        'n_cal':          len(cal_idx),
        'message':        'Calibration computed successfully.',
    })

    _calibration_cache = result
    return result


def get_cached_calibration():
    """Return cached calibration result. Does NOT trigger pipeline on miss — returns None."""
    return _calibration_cache


def get_or_run_calibration():
    """Return cached result, OR run pipeline if not yet computed. Use only in admin/explicit calls."""
    global _calibration_cache
    if _calibration_cache is None:
        return run_calibration_pipeline()
    return _calibration_cache


def invalidate_cache():
    """Call after new diagnoses are added to force re-evaluation on next request."""
    global _calibration_cache
    _calibration_cache = None


# =============================================================================
# 5. PER-PREDICTION CALIBRATION
# =============================================================================

def calibrate_prediction(raw_probs):
    """
    Apply the cached temperature to a single probability vector.
    Returns (None, False) immediately if calibration hasn't been run yet — never blocks.
    """
    cal = get_cached_calibration()   # returns None if not yet computed — no pipeline trigger

    if not cal or not cal.get('calibrated'):
        return None, False

    T          = cal['temperature']
    cal_probs  = apply_temperature(raw_probs, T)
    top_conf   = float(np.max(cal_probs))
    cal_pct    = int(round(top_conf * 100))
    return cal_pct, True

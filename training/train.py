import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

FS = 173.61


def features(x):
    xc = x - x.mean()
    spec = np.abs(np.fft.rfft(xc)[1:47]) ** 2
    freqs = np.arange(1, 47) * FS / len(x)
    bands = np.bincount(np.digitize(freqs, [4, 8, 13, 30]), weights=spec, minlength=5)
    base = [
        float(x.std()),
        float(np.abs(np.diff(x)).mean()),
        float(np.ptp(x)),
        float(((xc[1:] * xc[:-1]) < 0).mean()),
    ]
    return base + (bands / (spec.sum() or 1.0)).tolist()


def main(path):
    df = pd.read_csv(path)
    signals = df.filter(regex=r"^X\d+$").to_numpy(dtype=float)
    labels = (df["y"].to_numpy() == 1).astype(int)
    feats = np.array([features(row) for row in signals])
    grouped = "Unnamed: 0" in df.columns
    if grouped:
        groups = df["Unnamed: 0"].astype(str).str.split(".", n=1).str[1].to_numpy()
        tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=7).split(feats, labels, groups))
        xtr, xte, ytr, yte, gtr = feats[tr], feats[te], labels[tr], labels[te], groups[tr]
        folds = GroupKFold(5)
    else:
        xtr, xte, ytr, yte = train_test_split(feats, labels, test_size=0.25, stratify=labels, random_state=7)
        gtr = None
        folds = StratifiedKFold(5, shuffle=True, random_state=7)
    pipe = make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=2000))
    cv = cross_val_score(pipe, xtr, ytr, cv=folds, groups=gtr, scoring="roc_auc")
    pipe.fit(xtr, ytr)
    pred = pipe.predict(xte)
    scaler, model = pipe[0], pipe[1]
    tn, fp, fn, tp = confusion_matrix(yte, pred).ravel()
    out = {
        "source": Path(path).name,
        "split": "recording-level" if grouped else "window-level",
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "coef": model.coef_[0].tolist(),
        "intercept": float(model.intercept_[0]),
        "metrics": {
            "accuracy": float(accuracy_score(yte, pred)),
            "precision": float(precision_score(yte, pred)),
            "recall": float(recall_score(yte, pred)),
            "auc": round(float(roc_auc_score(yte, pipe.decision_function(xte))), 3),
            "cv_auc_mean": round(float(cv.mean()), 3),
            "cv_auc_std": round(float(cv.std()), 3),
            "confusion": {"tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn)},
            "n_test": int(len(yte)),
        },
    }
    target = Path(__file__).resolve().parent.parent / "data" / "weights.json"
    target.write_text(json.dumps(out, indent=2))
    print(out["metrics"])


if __name__ == "__main__":
    main(sys.argv[1])

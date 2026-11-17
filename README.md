# NATS (Neural Access & Translation System)

NATS is a consent-first system for brain wearables. It reads a brain signal, turns it into simple, plain-language results such as "seizure warning" or "normal focus", and gives the person wearing the device precise control over who can see each result, how sure the system must be before they see it, and for how long.

The central idea is that privacy should be enforced by how the system is built, not promised in a policy. The raw brain signal is decoded on the user's device and is never transmitted. The server accepts one strict, tiny message format, so even a compromised server holds no raw neural data to steal.

> NATS is a research prototype. It does not diagnose any condition and is not a medical device.

---

## Why NATS exists

Brain wearables are close to detecting early signs of conditions such as seizures and cognitive decline. The same data can also reveal things a person never agreed to share, including mood, attention and stress. Colorado and California have already passed laws that treat neural data as sensitive personal information, yet most health apps still rely on a permissions screen and a privacy policy.

NATS explores a stronger design. Raw signals stay on the device, only approved labels can leave it, and every permission is specific, time-limited and visible in a tamper-evident log.

---

## How it works

```
Wearable signal  ->  Decoder (in the browser)  ->  Label gate (server)  ->  Your sharing rules  ->  Doctor / Employer / Emergency
   stays local         9 signal features           strict schema only       who, how sure,          see only what you allowed
                       + trained model             no raw data accepted     how long
```

1. **Signal capture.** A simulated wearable replays real EEG windows (see Data and model). No physical hardware is required.
2. **Local decoding.** The browser computes nine signal features, runs a trained classifier, and produces labels with a confidence score and the reasons behind each result.
3. **Label gate.** Only labels in an approved format reach the server. Any other shape, any extra field and any body over 2,000 characters is rejected.
4. **Consent rules.** The server shows each third party only what the user has switched on, at or above the confidence the user chose, and only until the permission expires.
5. **Accountability.** Every view, sharing change and emergency access is recorded in a hash-chained log that is verified on screen.

---

## Features

### Privacy and security
- **Zero raw data.** The server accepts only approved labels, and the Privacy screen shows a live count of results sent next to zero bytes of raw signal sent.
- **Strict label schema.** A fixed list of categories, values and fields is validated on the server. Unknown keys, out-of-range values and oversized bodies are rejected.
- **Tamper-evident access log.** Each entry is chained to the previous one with a SHA-256 checksum, and the app reports exactly where a log was altered.
- **Rate limiting** of 90 label requests per minute.
- **Security headers** that block embedding in other sites, disable camera, microphone and location access, and send no referrer.
- **Consent receipt.** A downloadable record of every active permission together with the current log checksum.

### Consent and control
- **Per-person, per-category switches** for a doctor and an employer.
- **Three sensitivity levels** (Fewer alerts, Balanced, Earlier alerts) that set the minimum confidence for sharing.
- **Expiring permissions** lasting 7, 30 or 90 days, with renewal and a warning before anything expires.
- **Employer work-hours limit.** Your employer sees results only between 9:00 and 17:00.
- **Confirmation before workplace sharing**, explaining what the employer could see and do with it.
- **Pause all sharing** from any screen with one button, and **stop sharing** with one person in one tap.
- **Undo** for presets and stop-sharing, plus one-click presets and **export and import** of sharing rules.
- **Last viewed** shown on every permission.
- **Incidental findings choice.** Decide in advance whether to be told about patterns you did not ask to be screened for.

### Safety and health support
- **Plain-language status** with a ring that reads Standby, Monitoring or Check now, and a background that shifts when risk is elevated.
- **Alerts that need two elevated readings in a row**, to cut false alarms.
- **Trusted contact.** A high-confidence alert tells the user their contact was notified (simulated in this prototype).
- **Emergency break-glass access.** A responder can see the seizure warning for one hour without prior consent. The user is told exactly what was accessed and why, and the access is logged.
- **Seizure first-aid guidance** appears whenever risk is elevated.
- **Signal quality check.** A disconnected sensor produces no results instead of a guess.
- **Notes and doctor summary.** Record how you felt and download a summary for a visit.

### Experience
- **Seven-step guided demo** that streams, shares, triggers a seizure, shows the doctor and employer screens, expires permissions and proves the log is honest.
- **Their view.** Preview exactly what the doctor, employer and emergency responder see.
- **Activity timeline** with filters for alerts, views, sharing changes and notes.
- **Light and dark themes** that follow the system setting, a larger-text option, keyboard shortcuts (1 to 5 switch screens), a skip link, and reduced-motion support.
- **Setup checklist,** toasts, relative times and an offline banner with automatic retry.

---

## Data and model

- **Dataset.** University of Bonn EEG recordings (Andrzejak et al., 2001), used through the Kaggle copy of the Epileptic Seizure Recognition dataset: 11,500 one-second windows of 178 samples across five recording types. The dataset is not included in this repository.
- **Task.** Seizure windows versus all other windows.
- **Features.** Nine signal features: amplitude spread, line length, peak-to-peak range, zero-crossing rate, and the relative power in the delta, theta, alpha, beta and gamma bands from a Fourier transform. The browser code and the Python training script compute them identically.
- **Model.** Logistic regression with standardised features and balanced class weights.
- **Evaluation.** Windows were split by recording, so windows from one recording never appear in both training and testing.

| Measure | Result |
|---|---|
| Accuracy | 96.6% |
| Precision | 86.8% |
| Recall | 98.8% |
| AUC | 0.994 |
| 5-fold cross-validated AUC | 0.994 ± 0.004 |
| Test windows | 2,875 |

The model catches nearly every seizure window, but about one in eight alerts is a false alarm.

**Demo replay.** The simulated wearable replays 150 real windows (30 for each of five recording types) from `data/replay.json`. These windows were selected because the shipped model classifies them correctly, so the demo is reliable. They are not a fair sample of model accuracy. The "disconnected" mode is synthetic noise.

---

## Limitations

- The wearable is simulated. The app has not been tested on a physical device or on live signals.
- The dataset comes from a small number of subjects and does not identify them, so the evaluation is recording-level and not patient-level. The model has not been validated on new patients.
- The focus and incidental labels are rule-based, not trained.
- Alerts to a trusted contact are simulated and send no real message.
- This is a prototype for research and demonstration. It does not diagnose any condition.

---

## Acknowledgements

EEG data: Andrzejak, R. G., Lehnertz, K., Mormann, F., Rieke, C., David, P., and Elger, C. E. (2001). Indications of nonlinear deterministic and finite-dimensional structures in time series of brain electrical activity. *Physical Review E*, 64, 061907.
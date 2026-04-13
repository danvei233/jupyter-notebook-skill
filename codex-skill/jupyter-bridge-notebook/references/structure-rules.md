# Structure Rules

## Core Principle

Do not leave long, mixed-purpose code in a single cell when the task can be made clearer, cheaper to rerun, or easier to debug by splitting it.

## Splitting Rules

### Split by task

Prefer separate cells for:

- imports and environment setup
- configuration and constants
- data loading
- preprocessing or cleaning
- feature engineering
- analysis or metrics
- visualization
- export or persistence
- conclusion or summary

### Split by debugging boundary

Isolate steps that are likely to fail or need repeated inspection:

- file reads and writes
- network and database access
- authentication
- heavy computation
- plotting
- external tool calls

### Split by rerun cost

Do not bind these together unless the user explicitly wants it:

- expensive initialization with cheap display logic
- long-running transformation with final reporting
- data retrieval with plotting

### Split markdown intentionally

Add markdown headings when the notebook is meant to communicate, not just execute.

Use:

- `#` for notebook title
- `##` for major stages
- `###` for sub-steps when the notebook is a tutorial, report, or experiment log

Prefer lighter markdown when the user wants a minimal runnable notebook.

## Templates

### Data-analysis template

1. Title markdown
2. Environment and imports
3. Parameters/config
4. Data loading
5. Data cleaning
6. Analysis/statistics
7. Visualization
8. Conclusion markdown

Use this by default when the task type is unclear.

### Experiment/tuning template

1. Title markdown
2. Configuration
3. Data preparation
4. Baseline run
5. Variant runs
6. Result comparison

### Debugging template

1. Problem statement markdown
2. Minimal reproduction cell
3. State inspection cell
4. Step-by-step validation cell
5. Post-fix verification cell

### Delivery/presentation template

1. Title markdown
2. Background or goal markdown
3. Core processing steps
4. Results and plots
5. Final summary markdown

## User-Style Adjustment

- Tutorial/report/experiment request: add more markdown structure
- Minimal runnable request: keep markdown sparse but maintain logical code splits
- Debugging-focused request: split more aggressively and isolate risky steps

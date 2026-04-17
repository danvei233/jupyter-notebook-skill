# Structure Rules

## Core Principle

Do not leave long, mixed-purpose code in a single cell when the task can be made clearer, cheaper to rerun, or easier to debug by splitting it.
Do not treat notebook authoring as a one-shot dump followed by a single full-notebook execution.

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

When the notebook includes plotting, also prefer:

- one dedicated plot-style setup cell
- separate plotting cells for distinct chart families or analytical questions
- separate interpretation markdown after major figures when the notebook is report-like

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

### Split by execution checkpoint

Prefer placing explicit validation boundaries between stages:

- imports and environment checks
- data loading and quick inspection
- feature engineering
- modeling
- evaluation
- final reporting

Each major stage should be runnable and checkable before the notebook grows further.
When creating new structure through bridge batch operations, keep one batch to one stage, usually 2-4 related cells.

### Split markdown intentionally

Add markdown headings when the notebook is meant to communicate, not just execute.

Use:

- `#` for notebook title
- `##` for major stages
- `###` for sub-steps when the notebook is a tutorial, report, or experiment log

Prefer lighter markdown when the user wants a minimal runnable notebook.

## Matplotlib Style Rules

For `matplotlib.pyplot` / `plt` charts, use this default visual contract unless the user explicitly requests something else:

- English text: `Times New Roman`
- Chinese text: `SimSun` / 宋体
- UTF-8-safe Chinese text support must be enabled
- all axes spines: line width `1.5`
- chart title: bold
- axis titles: bold
- tick labels: bold

Prefer adding one reusable style setup cell before the main plotting section, for example:

```python
import matplotlib.pyplot as plt

plt.rcParams["font.family"] = ["Times New Roman", "SimSun"]
plt.rcParams["font.sans-serif"] = ["SimSun", "Microsoft YaHei", "SimHei"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["figure.dpi"] = 120

def apply_plot_style(ax, title=None, xlabel=None, ylabel=None):
    if title is not None:
        ax.set_title(title, fontweight="bold")
    if xlabel is not None:
        ax.set_xlabel(xlabel, fontweight="bold")
    if ylabel is not None:
        ax.set_ylabel(ylabel, fontweight="bold")
    for spine in ax.spines.values():
        spine.set_linewidth(1.5)
    for label in ax.get_xticklabels() + ax.get_yticklabels():
        label.set_fontweight("bold")
```

Do not scatter inconsistent font and spine settings across many plotting cells if one shared helper cell can enforce the style.

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

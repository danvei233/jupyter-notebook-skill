# Plotting Style

Use this default style for `matplotlib.pyplot` / `plt` charts unless the user explicitly overrides it.

## Required defaults

- English font: `Times New Roman`
- Chinese font: `SimSun` / 宋体
- UTF-8-safe Chinese support enabled
- `plt.rcParams["axes.unicode_minus"] = False`
- axes spines line width: `1.5`
- chart title: bold
- axis titles: bold
- tick labels: bold

## Preferred setup

Put one reusable plotting-style setup cell near imports or the visualization section instead of repeating the style in every chart cell.

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

## Practical note

If the notebook may run on different machines, keep the fallback Chinese font list broad enough to avoid missing glyphs while still preferring `SimSun`.

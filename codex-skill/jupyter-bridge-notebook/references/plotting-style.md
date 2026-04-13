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
- do not rely on matplotlib defaults after setup
- every real chart cell must call the shared style helper

## Preferred setup

Put one reusable plotting-style setup cell near imports or the visualization section instead of repeating the style in every chart cell.

```python
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

plt.rcParams["font.family"] = ["Times New Roman", "SimSun"]
plt.rcParams["font.sans-serif"] = ["SimSun", "Microsoft YaHei", "SimHei"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["figure.dpi"] = 120
plt.rcParams["mathtext.fontset"] = "stix"

EN_FONT = "Times New Roman"
CN_FONT = "SimSun"

def _pick_font(text):
    if text is None:
        return EN_FONT
    text = str(text)
    return CN_FONT if any("\u4e00" <= ch <= "\u9fff" for ch in text) else EN_FONT

def _font_props(text, size=None):
    return fm.FontProperties(family=_pick_font(text), weight="bold", size=size)

def apply_plot_style(ax, title=None, xlabel=None, ylabel=None):
    if title is not None:
        ax.set_title(title, fontproperties=_font_props(title))
    if xlabel is not None:
        ax.set_xlabel(xlabel, fontproperties=_font_props(xlabel))
    if ylabel is not None:
        ax.set_ylabel(ylabel, fontproperties=_font_props(ylabel))
    for spine in ax.spines.values():
        spine.set_linewidth(1.5)
    for label in ax.get_xticklabels():
        label.set_fontproperties(_font_props(label.get_text()))
    for label in ax.get_yticklabels():
        label.set_fontweight("bold")
        label.set_fontproperties(_font_props(label.get_text()))

def style_legend(ax):
    legend = ax.get_legend()
    if legend is None:
        return
    for text in legend.get_texts():
        text.set_fontproperties(_font_props(text.get_text()))
```

## Practical note

1. This setup cell should appear before the first real chart cell.
2. Every chart cell should call `apply_plot_style(ax, ...)`.
3. If a legend exists, also call `style_legend(ax)`.
4. If the notebook may run on different machines, keep the fallback Chinese font list broad enough to avoid missing glyphs while still preferring `SimSun`.

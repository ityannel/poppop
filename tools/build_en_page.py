"""Build the English introduction page (en/index.html) from index.html.

The Japanese page is the source. This script rewrites asset paths for the
/en/ folder and replaces every Japanese text with English, so both pages keep
the same structure. Run it after editing index.html:

    python tools/build_en_page.py

The words used inside the page's scripts live in lp/lp.js (``L(ja, en)``) and
lp/data.en.js.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "index.html"
OUTPUT = ROOT / "en" / "index.html"

PATHS = [
    ('<html lang="ja">', '<html lang="en">'),
    ('href="lp/', 'href="../lp/'),
    ('src="lp/', 'src="../lp/'),
    ('href="playground/"', 'href="../playground/"'),
    ('href="favicon.png"', 'href="../favicon.png"'),
    ('  <script src="popcorn-localization.js"></script>\n', ""),
    ('<script src="../lp/data.js"></script>', '<script src="../lp/data.js"></script>\n  <script src="../lp/data.en.js"></script>'),
    ('<link rel="canonical" href="https://popcorn.itya.site/">', '<link rel="canonical" href="https://popcorn.itya.site/en/">'),
    ('<meta property="og:url" content="https://popcorn.itya.site/">', '<meta property="og:url" content="https://popcorn.itya.site/en/">\n  <meta property="og:locale" content="en_US">'),
    (
        '<a class="lang-link" href="en/" hreflang="en" lang="en" title="English">EN</a>',
        '<a class="lang-link" href="../" hreflang="ja" lang="ja" title="日本語">JA</a>',
    ),
    ('<li><a href="en/" hreflang="en" lang="en">English</a></li>', '<li><a href="../" hreflang="ja" lang="ja">日本語</a></li>'),
]

# Longer texts first, so a short text never breaks a longer one.
TEXT = [
    # head
    ("PopCorn｜書いた順に動く、小さなプログラミング言語", "PopCorn | A tiny language that runs in the order you write"),
    (
        "PopCorn は、値を >> で左から右へつないでいく、小さなプログラミング言語。読んだ順に、何が起きるかがわかります。ブラウザですぐに試せます。",
        "PopCorn is a tiny programming language where values flow left to right through >>. Read it once and you know what happens. Try it right in your browser.",
    ),
    (
        "値を >> で左から右へつないでいく、小さなプログラミング言語。ブラウザですぐに試せます。",
        "A tiny programming language where values flow left to right through >>. Try it right in your browser.",
    ),
    # nav
    (">本文へ<", ">Skip to content<"),
    ('aria-label="PopCorn のトップへ"', 'aria-label="PopCorn home"'),
    ('aria-label="ページの中"', 'aria-label="On this page"'),
    ('<a href="#rules">きまり</a>', '<a href="#rules">Rules</a>'),
    ('<a href="#lab">遊ぶ</a>', '<a href="#lab">Play</a>'),
    ('<a href="#try">試す</a>', '<a href="#try">Try</a>'),
    ('<a href="#learn">学ぶ</a>', '<a href="#learn">Learn</a>'),
    ('title="ポップした数"', 'title="Pops"'),
    ('<span class="sr-only">回ポップ</span>', '<span class="sr-only"> pops</span>'),
    ('title="ポップの音"', 'title="Pop sound"'),
    ('title="ミニゲーム"', 'title="Mini games"'),
    ('<span class="sr-only">ミニゲーム</span>', '<span class="sr-only">Mini games</span>'),
    ('🎮 ゲームで、おさらいする', '🎮 Review with a game'),
    ('<span class="sr-only">ポップの音</span>', '<span class="sr-only">Pop sound</span>'),
    # hero
    ("実験中のアルファ版", "Experimental alpha"),
    ('<span class="hero-catch">書いた順に、<em>動く。</em></span>', '<span class="hero-catch">Runs the way <em>you write.</em></span>'),
    (
        'PopCorn（ポップコーン）は、値を <code class="pipe-chip">&gt;&gt;</code> で、左から右へつないでいく、小さなプログラミング言語。読んだ順に、何が起きるかがわかります。',
        'PopCorn is a tiny programming language where values flow left to right through <code class="pipe-chip">&gt;&gt;</code>. Read it once, and you know what happens.',
    ),
    (">ブラウザで試す<", ">Try it in your browser<"),
    (">さわって遊ぶ<", ">Play with it<"),
    ("<li>インストールなしで動く</li>", "<li>No install</li>"),
    ("<li>エラーは日本語</li>", "<li>Made for beginners</li>"),
    ("<li>テストも書ける</li>", "<li>Tests built in</li>"),
    ('aria-label="パイプラインの例"', 'aria-label="A pipeline example"'),
    (">もう一回<", ">Replay<"),
    ("値が上から下へ、<b>&gt;&gt;</b> を通るたびに形を変えます", "Each time a value passes <b>&gt;&gt;</b>, it changes shape"),
    ('aria-label="ポップコーンの粒"', 'aria-label="Popcorn kernels"'),
    ("<p>粒をタップすると、ポップします</p>", "<p>Tap a kernel to pop it</p>"),
    # how chips
    ('<span class="sr-only">さわり方：</span>', '<span class="sr-only">How to play: </span>'),
    ("</svg>タップ</span>", "</svg>Tap</span>"),
    ("</svg>ドラッグ</span>", "</svg>Drag</span>"),
    ("</svg>長押し</span>", "</svg>Hold</span>"),
    ("</svg>入力</span>", "</svg>Type</span>"),
    ("</svg>つかんで投げる</span>", "</svg>Grab and throw</span>"),
    # 01 rules
    ("<span>01</span>きまり", "<span>01</span>Rules"),
    ('<h2>覚えることは、<br class="sp">3つだけ。</h2>', '<h2>Just three things<br class="sp"> to learn.</h2>'),
    (
        "PopCorn の文は、まるで文章のよう。左から読んで、<b>.</b> で終わります。",
        "A PopCorn statement reads like a sentence: left to right, ending with a <b>.</b>",
    ),
    # 02 order
    ("<span>02</span>読みやすさ", "<span>02</span>Reading"),
    ('<h2>読む順が、<br class="sp">そのまま動く順。</h2>', '<h2>Read order<br class="sp"> is run order.</h2>'),
    (
        "「偶数だけ選んで、2 倍して、合計する」。同じことを、2 つの書き方でくらべてみましょう。",
        "“Pick the even numbers, double them, add them up.” Compare two ways to write it.",
    ),
    ("<h3>入れ子の書き方<small>（Python の例）</small></h3>", "<h3>Nested calls<small> (Python)</small></h3>"),
    (
        "いちばん内側の <code>nums</code> から、外へ外へ。目は右から左へ、行ったり来たりします。",
        "Start at the innermost <code>nums</code> and work outward. Your eyes jump right to left and back.",
    ),
    ("<h3>PopCorn<small>（書いた順に）</small></h3>", "<h3>PopCorn<small> (in order)</small></h3>"),
    ("書いた順に、左から右へ。目は、まっすぐ進むだけ。", "Left to right, in the order you wrote it. Your eyes just move forward."),
    ("</svg>動く順に光らせる</button>", "</svg>Light it up in run order</button>"),
    # 03 lab
    ("<span>03</span>遊ぶ", "<span>03</span>Play"),
    ("<h2>パイプライン工作室</h2>", "<h2>Pipeline workshop</h2>"),
    (
        "ブロックをつないで、値がどう流れるか見てみよう。エラーになっても、だいじょうぶ。",
        "Connect blocks and watch the values flow. Errors are part of the fun.",
    ),
    ('<span class="lab-label">おすすめ</span>', '<span class="lab-label">Try these</span>'),
    ('aria-label="ブロック置き場"', 'aria-label="Blocks"'),
    ('<span class="lab-label">いまのコード</span>', '<span class="lab-label">The code</span>'),
    ("</svg>もう一度流す</button>", "</svg>Run it again</button>"),
    (">Playground で開く<", ">Open in Playground<"),
    ("ぜんぶ外す<small>長押し</small>", "Remove all<small>hold</small>"),
    # 04 check
    ("<span>04</span>条件分岐", "<span>04</span>Conditions"),
    ('<h2>条件は、<br class="sp">上から順に。</h2>', '<h2>Conditions,<br class="sp"> top to bottom.</h2>'),
    (
        "<code>Check</code> は <code>when</code> を上から調べて、最初に合ったものを選びます。数字をタップしてみよう。",
        "<code>Check</code> tries each <code>when</code> from the top and picks the first match. Tap a number.",
    ),
    ('aria-label="1 から 30 までの数"', 'aria-label="Numbers 1 to 30"'),
    ('<span class="lg lg-n">そのまま</span>', '<span class="lg lg-n">Number</span>'),
    ("</svg>1 から順に</button>", "</svg>Count from 1</button>"),
    # 05 tools
    ("<span>05</span>道具", "<span>05</span>Tools"),
    ('<h2>ちょっと便利な記号と、<br class="sp">やさしいエラー。</h2>', '<h2>Handy symbols,<br class="sp"> clear errors.</h2>'),
    (
        "流れを止めずに、のぞいたり、守ったり、分けたり。まちがえたときは、日本語で教えてくれます。",
        "Peek into the flow, guard it, or split it without stopping. When something goes wrong, PopCorn shows you where.",
    ),
    ('aria-label="道具"', 'aria-label="Tools"'),
    ("<code>&gt;?&gt;</code>のぞく", "<code>&gt;?&gt;</code>Peek"),
    ("<code>&gt;!&gt;</code>差し替える", "<code>&gt;!&gt;</code>Fallback"),
    ("<code>Fork</code>分ける", "<code>Fork</code>Split"),
    ("<code>Test</code>確かめる", "<code>Test</code>Test"),
    ("<code>!</code>エラー", "<code>!</code>Errors"),
    ("<h3>流れの途中を、のぞく</h3>", "<h3>Peek into the flow</h3>"),
    (
        "<code>&gt;&gt;</code> を <code>&gt;?&gt;</code> にすると、そこを通る値が表示されます。値は変わりません。コードの <b>&gt;&gt;</b> をタップしてみよう。",
        "Change <code>&gt;&gt;</code> to <code>&gt;?&gt;</code> to print the value passing through. The value itself stays the same. Tap a <b>&gt;&gt;</b> in the code.",
    ),
    (
        "表示の <code>line 1 after Range</code> は「1 行目の Range のあと」、<code>(List)</code> は値の種類です。",
        "<code>line 1 after Range</code> tells you where you are, and <code>(List)</code> is the value's type.",
    ),
    ("<h3>失敗したら、差し替える</h3>", "<h3>If it fails, swap it</h3>"),
    (
        "<code>&gt;!&gt;</code> より左でエラーが起きたら、右の値に差し替えて、そのまま進みます。数にできない文字を入れてみよう。",
        "If anything left of <code>&gt;!&gt;</code> raises an error, the value on the right takes its place and the flow goes on. Type something that isn't a number.",
    ),
    ("<span><code>text</code> に入れる文字</span>", "<span>Value of <code>text</code></span>"),
    ("<h3>ひとつの値から、いくつも計算する</h3>", "<h3>One value, many results</h3>"),
    (
        "<code>Fork</code> は、同じ値を、いくつもの道に分けて計算します。数字を変えてみよう。",
        "<code>Fork</code> sends the same value down several paths at once. Change the numbers.",
    ),
    ("<h3>テストも、PopCorn で書ける</h3>", "<h3>Tests, written in PopCorn</h3>"),
    (
        "名前が <code>Test</code> で始まる関数がテストです。<code>popcorn test</code> で動かすと、ちがうところを日本語で教えてくれます。",
        "Any function whose name starts with <code>Test</code> is a test. Run <code>popcorn test</code> to see what doesn't match. Test reports are in Japanese for now.",
    ),
    (
        "<span>わざとバグを入れる（<code>+</code> を <code>-</code> に）</span>",
        "<span>Add a bug on purpose (<code>+</code> becomes <code>-</code>)</span>",
    ),
    ("<h3>まちがえても、日本語で</h3>", "<h3>Errors that point at the spot</h3>"),
    (
        "どこが、なぜダメなのかを、日本語で伝えます。よくあるまちがいを、わざとしてみよう。",
        "PopCorn tells you where and why it stopped. Try a common mistake on purpose. In the Playground, errors are also explained in Japanese.",
    ),
    # 06 try
    ("<span>06</span>試す", "<span>06</span>Try"),
    ('<h2>本物の PopCorn を、<br class="sp">ここで。</h2>', '<h2>Real PopCorn,<br class="sp"> right here.</h2>'),
    (
        "Playground と同じ処理系が、このページの中で動きます。書きかえて、<b>実行</b> を押してみよう。",
        "The same interpreter as the Playground runs inside this page. Edit the code and press <b>Run</b>.",
    ),
    ('aria-label="例"', 'aria-label="Examples"'),
    (">まだ準備していません<", ">Not loaded yet<"),
    ('aria-label="PopCorn のコード"', 'aria-label="PopCorn code"'),
    ("</svg>実行<kbd>", "</svg>Run<kbd>"),
    (">止める</button>", ">Stop</button>"),
    (
        "ここに、結果が出ます。はじめの 1 回だけ、準備に少し時間がかかります。",
        "Results show up here. The first run takes a moment to load.",
    ),
    # 07 learn
    ("<span>07</span>学ぶ", "<span>07</span>Learn"),
    ('<h2>ロボット君と、<br class="sp">いっしょに。</h2>', '<h2>Learn with<br class="sp"> Robot.</h2>'),
    (
        "Playground の「ロボット君」には、8 つのレッスンがあります。答え合わせは本物の処理系で。ヒントも、答えも、エラーの説明もあります。",
        "Robot (ロボット君) in the Playground has 8 lessons, checked by the real interpreter, with hints, answers and help with errors. The lessons are in Japanese for now.",
    ),
    ('aria-label="ロボット君"', 'aria-label="Robot"'),
    ("やあ！ ぼくはロボット君。下のレッスンをタップしてみて。", "Hi! I'm Robot. Tap a lesson below."),
    (
        "わからないところは、AI の先生（Gemini）に聞いたり、練習問題を作ってもらったりもできます。進みぐあいは、ブラウザに保存されます。",
        "You can also ask an AI tutor (Gemini) questions or for practice problems. Your progress is saved in your browser.",
    ),
    (">ロボット君に会いに行く<", ">Go meet Robot<"),
    # 08 start
    ("<span>08</span>はじめる", "<span>08</span>Start"),
    ('<h2>書く場所を、<br class="sp">えらべる。</h2>', '<h2>Pick where<br class="sp"> to write.</h2>'),
    ('<p class="start-tag">いちばん手軽</p>', '<p class="start-tag">Easiest</p>'),
    (
        "インストールなし。ブラウザを開くだけで、書いて、動かして、共有できます。例とレッスンつき。",
        "No install. Open your browser to write, run and share. Comes with examples and lessons (in Japanese).",
    ),
    (">開く<svg", ">Open<svg"),
    ('<p class="start-tag">Python 3.10 以上</p>', '<p class="start-tag">Python 3.10+</p>'),
    ("<h3>コマンド</h3>", "<h3>Command line</h3>"),
    (
        "手元のファイルを動かしたり、<code>popcorn test</code> でテストしたり。",
        "Run files on your computer and test them with <code>popcorn test</code>.",
    ),
    ('aria-label="コマンドをコピー"', 'aria-label="Copy the commands"'),
    ("<h3>エディター拡張</h3>", "<h3>Editor extension</h3>"),
    (
        "日本語のホバー、データの流れの表示、まちがいの指摘、実行コマンド。リポジトリの <code>vscode-popcorn</code> にあります。",
        "Hover help in Japanese, a data-flow view, problem highlights and a run command. It lives in <code>vscode-popcorn</code> in the repository.",
    ),
    (">GitHub で見る<", ">View on GitHub<"),
    # finale
    ('<h2>さあ、<br class="sp">ポップしよう。</h2>', '<h2>Now,<br class="sp"> let\'s pop.</h2>'),
    (">Playground をひらく<", ">Open the Playground<"),
    ("空いているところをタップすると、もっと弾けます", "Tap an empty spot to pop more"),
    # footer
    (
        "PopCorn は、函館高専で情報工学を学ぶ「いちゃ」がつくっている、実験中のプログラミング言語です。書き方や動きは、これから変わることがあります。",
        "PopCorn is an experimental programming language made by Itya, an information engineering student at NIT Hakodate College in Japan. Its syntax and behavior may still change.",
    ),
    (">言語仕様<", ">Language spec (Japanese)<"),
    ('デザイン・開発 <a href="https://itya.site/">いちゃ</a> ― 会いに行くデザイン。', 'Design and code by <a href="https://itya.site/">Itya</a> ― 会いに行くデザイン。'),
    ("<span>コードは MIT ライセンス</span>", "<span>Code under the MIT License</span>"),
]

# Japanese that stays on purpose: the language switch, Robot's Japanese name,
# and the brand line.
ALLOWED = ("日本語", "ロボット君", "会いに行くデザイン。")
JAPANESE = re.compile(r"[぀-ヿ㐀-鿿！-｠]")


def build(source: str) -> str:
    page = source
    for old, new in PATHS + TEXT:
        if old not in page:
            raise ValueError(f"Not found in index.html: {old[:60]!r}")
        page = page.replace(old, new)
    leftover = page
    for word in ALLOWED:
        leftover = leftover.replace(word, "")
    found = sorted({m.group(0) for m in JAPANESE.finditer(leftover)})
    if found:
        lines = [line.strip() for line in leftover.splitlines() if JAPANESE.search(line)]
        raise ValueError("Japanese text left in en/index.html:\n" + "\n".join(lines[:10]))
    return page


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(build(SOURCE.read_text(encoding="utf-8")), encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

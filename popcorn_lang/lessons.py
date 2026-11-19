"""Interactive lessons shipped with the PopCorn runtime.

Keeping these definitions beside the interpreter lets the browser tutor use
the same release archive as the language itself.
"""

from __future__ import annotations

from typing import Any

from .evaluator import _values_equal, format_popcorn_str


LESSONS = (
    {
        "id": "pipeline",
        "title": "はじめての表示",
        "badge": "01",
        "intro": "まずは短い文字を画面に出して、PopCornの流れを見てみよう。",
        "goal": '表示する文字を "Hello, World!" に変えてください。',
        "starter": '"Hello" >> Display.',
        "solution": '"Hello, World!" >> Display.',
        "hints": (
            "`>> Display.` の左にある値が、出力欄に表示されます。",
            '`"Hello"` を `"Hello, World!"` に書き換えてみよう。',
        ),
        "expected": "Hello, World!",
        "required": (">>", "Display", '"Hello, World!"'),
        "success": "できました！ PopCornの最初のプログラムが動きました。",
    },
    {
        "id": "map",
        "title": "数字を2倍にしよう",
        "badge": "02",
        "intro": "Mapは、リストの値を一つずつ同じルールで作り替えるよ。",
        "goal": "[1, 2, 3] の数字をそれぞれ2倍にしてください。",
        "starter": (
            "[1, 2, 3] >> Map as number {\n"
            "    number + 1.\n"
            "} >> doubled.\n\n"
            "doubled >> Display."
        ),
        "solution": (
            "[1, 2, 3] >> Map as number {\n"
            "    number * 2.\n"
            "} >> doubled.\n\n"
            "doubled >> Display."
        ),
        "hints": (
            "`number`には、1、2、3が順番に入ります。",
            "`number + 1` を `number * 2` に変えてみよう。",
        ),
        "expected": [2.0, 4.0, 6.0],
        "required": ("Map", "*", "Display"),
        "success": "きれいに2倍になりました！ Mapは新しいリストを作ります。",
    },
    {
        "id": "filter",
        "title": "偶数だけ集めよう",
        "badge": "03",
        "intro": "Filterは、条件に合う値だけを新しいリストへ集めるよ。",
        "goal": "[1, 2, 3, 4] から2と4だけを残してください。",
        "starter": (
            "[1, 2, 3, 4] >> Filter as number {\n"
            "    number > 2.\n"
            "} >> evens.\n\n"
            "evens >> Display."
        ),
        "solution": (
            "[1, 2, 3, 4] >> Filter as number {\n"
            "    number % 2 == 0.\n"
            "} >> evens.\n\n"
            "evens >> Display."
        ),
        "hints": (
            "偶数は、2で割った余りが0になる数です。",
            "条件を `number % 2 == 0` にしてみよう。",
        ),
        "expected": [2.0, 4.0],
        "required": ("Filter", "%", "==", "Display"),
        "success": "2と4を集められました！ 条件がtrueの値だけが残ります。",
    },
    {
        "id": "reduce",
        "title": "合計を出そう",
        "badge": "04",
        "intro": "Reduceは、これまでの結果と次の値を使って一つの答えを作るよ。",
        "goal": "[1, 2, 3, 4] を順番に足して、10にしてください。",
        "starter": (
            "[1, 2, 3, 4] >> Reduce(1) as (acc, item) {\n"
            "    acc * item.\n"
            "} >> total.\n\n"
            "total >> Display."
        ),
        "solution": (
            "[1, 2, 3, 4] >> Reduce(0) as (acc, item) {\n"
            "    acc + item.\n"
            "} >> total.\n\n"
            "total >> Display."
        ),
        "hints": (
            "`acc`はこれまでの結果、`item`は次の数字です。初期値も0にしよう。",
            "`Reduce(1)` を `Reduce(0)` に、`acc * item` を `acc + item` に変えてみよう。",
        ),
        "expected": 10.0,
        "required": ("Reduce", "+", "Display"),
        "success": "合計は10です！ Reduceで複数の値を一つにまとめられました。",
    },
    {
        "id": "update",
        "title": "プロフィールを更新しよう",
        "badge": "05",
        "intro": "Updateは、元の辞書を変えずに新しい内容の辞書を作るよ。",
        "goal": "scoreを15にして、activeにtrueを追加してください。",
        "starter": (
            '{"name": "Ada", "score": 10} >> Update as user {\n'
            "    11 >> user::score.\n"
            "} >> updated.\n\n"
            "updated >> Display."
        ),
        "solution": (
            '{"name": "Ada", "score": 10} >> Update as user {\n'
            "    15 >> user::score.\n"
            "    true >> user::active.\n"
            "} >> updated.\n\n"
            "updated >> Display."
        ),
        "hints": (
            "書き方は `新しい値 >> user::項目名.` の順番です。",
            "`15 >> user::score.` の次に、activeの行も追加してみよう。",
        ),
        "expected": {"name": "Ada", "score": 15.0, "active": True},
        "required": ("Update", "::score", "::active", "Display"),
        "success": "プロフィールを更新できました！ 元の辞書はそのまま残ります。",
    },
    {
        "id": "check",
        "title": "数字を分類しよう",
        "badge": "06",
        "intro": "Checkは、条件を上から調べて最初に合った答えを選ぶよ。",
        "goal": "数字の2を、文字列のsmallに分類してください。",
        "starter": (
            "2 >> Check as value {\n"
            "    when value == 0:\n"
            '        "zero".\n'
            "    else:\n"
            '        "unknown".\n'
            "} >> label.\n\n"
            "label >> Display."
        ),
        "solution": (
            "2 >> Check as value {\n"
            "    when value == 0:\n"
            '        "zero".\n'
            "    when value in [1, 2, 3]:\n"
            '        "small".\n'
            "    else:\n"
            '        "large".\n'
            "} >> label.\n\n"
            "label >> Display."
        ),
        "hints": (
            "`when value in [1, 2, 3]:` なら、1、2、3のどれかに合うか調べられます。",
            '新しいwhenの中に文字列の`"small"`を書いてみよう。',
        ),
        "expected": "small",
        "required": ("Check", "when", "else", "Display"),
        "success": "2をsmallに分類できました！ どれにも合わない値はelseへ進みます。",
    },
    {
        "id": "function",
        "title": "足し算関数を作ろう",
        "badge": "07",
        "intro": "`pop`を使って、二つの数字を足す自分の関数を作ってみよう。",
        "goal": "AddTwoで10と20を足し、30を作ってください。",
        "starter": (
            "(left, right) >> pop AddTwo {\n"
            "    left - right.\n"
            "}\n\n"
            "10 >> AddTwo(20) >> total.\n"
            "total >> Display."
        ),
        "solution": (
            "(left, right) >> pop AddTwo {\n"
            "    left + right.\n"
            "}\n\n"
            "10 >> AddTwo(20) >> total.\n"
            "total >> Display."
        ),
        "hints": (
            "関数の最後にある値が、その関数の答えになります。",
            "`left - right` の `-` を `+` に変えてみよう。",
        ),
        "expected": 30.0,
        "required": ("pop AddTwo", "left + right", "Display"),
        "success": "足し算関数の完成です！ 作った関数は何度でも使えます。",
    },
    {
        "id": "loop",
        "title": "5まで数えて止めよう",
        "badge": "08",
        "intro": "Loopで数字を一つずつ増やし、Breakと後置whenで安全に止めてみよう。",
        "goal": "0から始めて、5になったところで止めてください。",
        "starter": (
            "0 >> Loop as state {\n"
            "    state >> Break when state >= 3.\n"
            "    state + 1.\n"
            "} >> result.\n\n"
            "result >> Display."
        ),
        "solution": (
            "0 >> Loop as state {\n"
            "    state >> Break when state >= 5.\n"
            "    state + 1.\n"
            "} >> result.\n\n"
            "result >> Display."
        ),
        "hints": (
            "Breakへ流した値が、Loop全体の答えになります。",
            "止まる条件の3を5に変えてみよう。困ったら上の「停止」を押せます。",
        ),
        "expected": 5.0,
        "required": ("Loop", "Break", "state >= 5", "Display"),
        "success": "5でぴったり止まりました！ 全8レッスン修了です。",
    },
)


def public_lessons() -> list[dict[str, Any]]:
    """Return JSON-safe lesson data for the Playground."""

    private = {"expected", "required"}
    return [
        {key: value for key, value in lesson.items() if key not in private}
        for lesson in LESSONS
    ]


def validate_lesson(lesson_id: str, source: str, result: Any) -> dict[str, Any]:
    """Validate a successful evaluation against one lesson."""

    lesson = next((item for item in LESSONS if item["id"] == lesson_id), None)
    if lesson is None:
        return {"passed": False, "message": "レッスン情報を確認できませんでした。"}

    missing = [text for text in lesson["required"] if text not in source]
    if missing:
        return {
            "passed": False,
            "message": f"結果に近づいています。今回は `{missing[0]}` を使ってみましょう。",
        }

    if not _values_equal(result, lesson["expected"]):
        return {
            "passed": False,
            "message": (
                f"もう一歩です。今の結果は {format_popcorn_str(result)}。"
                "課題のゴールをもう一度確認してみましょう。"
            ),
        }

    return {"passed": True, "message": lesson["success"]}

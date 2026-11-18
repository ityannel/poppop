"""Curated, executable examples for the browser Playground."""

from __future__ import annotations

from typing import Any


GALLERY = (
    {
        "id": "hello-pipeline",
        "category": "はじめの一歩",
        "title": "はじめの一歩｜値を流してみよう",
        "description": "42をパイプへ流し、answerという名前を付けます。",
        "interactive": False,
        "code": '42 >> answer.\n"答えは {answer} です。" >> Display.',
    },
    {
        "id": "map-double",
        "category": "リスト",
        "title": "リスト｜みんなを2倍にしよう",
        "description": "Mapでリストのすべての数値を2倍にします。",
        "interactive": False,
        "code": (
            "[1, 2, 3, 4] >> Map(value):\n"
            "    value * 2.\n"
            ".. >> doubled.\n\n"
            "doubled >> Display."
        ),
    },
    {
        "id": "filter-even",
        "category": "リスト",
        "title": "リスト｜偶数だけを集めよう",
        "description": "Filterで条件に合う数値だけを選びます。",
        "interactive": False,
        "code": (
            "[1, 2, 3, 4, 5, 6] >> Filter(value):\n"
            "    value % 2 == 0.\n"
            ".. >> evens.\n\n"
            "evens >> Display."
        ),
    },
    {
        "id": "fizzbuzz",
        "category": "定番",
        "title": "定番｜FizzBuzzに挑戦しよう",
        "description": "1から30までをFizz、Buzz、FizzBuzzに変換します。",
        "interactive": False,
        "code": (
            "30 >> Range >> Map(number):\n"
            "    number >> Check(value):\n"
            "        is value % 15 == 0:\n"
            '            "FizzBuzz".\n'
            "        is value % 3 == 0:\n"
            '            "Fizz".\n'
            "        is value % 5 == 0:\n"
            '            "Buzz".\n'
            "        else:\n"
            "            value >> Str.\n"
            "    ..\n"
            ".. >> fizzbuzz.\n\n"
            "fizzbuzz >> Display."
        ),
    },
    {
        "id": "fortune",
        "category": "ミニゲーム",
        "title": "ミニゲーム｜今日の運勢を占おう",
        "description": "名前を入力すると、今日の運勢をランダムに占います。",
        "interactive": True,
        "code": (
            '"あなたの名前は？ " >> Input >> name.\n'
            '["大吉", "中吉", "小吉", "吉", "末吉"] >> fortunes.\n'
            "(0, 4) >> Random >> fortune_index.\n"
            "(fortunes, fortune_index) >> Get >> fortune.\n\n"
            '"{name}さんの今日の運勢は「{fortune}」です！" >> Display.'
        ),
    },
    {
        "id": "number-guess",
        "category": "ミニゲーム",
        "title": "ミニゲーム｜数字を当てよう",
        "description": "1から10までの秘密の数字を一度で当てます。",
        "interactive": True,
        "code": (
            "(1, 10) >> Random >> secret.\n"
            '"1から10までの数字を当ててね: " >> Input >> Int >> guess.\n\n'
            "guess == secret >> Check:\n"
            "    is true:\n"
            '        "大正解！".\n'
            "    else:\n"
            '        "おしい！ 正解は {secret} でした。".\n'
            ".. >> message.\n\n"
            "message >> Display."
        ),
    },
    {
        "id": "rock-paper-scissors",
        "category": "ミニゲーム",
        "title": "ミニゲーム｜じゃんけんしよう",
        "description": "グー、チョキ、パーを入力してロボット君と勝負します。",
        "interactive": True,
        "code": (
            '["グー", "チョキ", "パー"] >> hands.\n'
            '"グー、チョキ、パーのどれにする？ " >> Input >> choice.\n'
            "(0, 2) >> Random >> robot_index.\n"
            "(hands, robot_index) >> Get >> robot.\n\n"
            "choice == robot >> Check:\n"
            "    is true:\n"
            '        "あいこです！ あなたもロボット君も{choice}。".\n'
            "    else:\n"
            '        "あなたは{choice}、ロボット君は{robot}でした！".\n'
            ".. >> result.\n\n"
            "result >> Display."
        ),
    },
    {
        "id": "dice-battle",
        "category": "ミニゲーム",
        "title": "ミニゲーム｜サイコロで勝負しよう",
        "description": "二つのサイコロを振り、大きな目が出た方の勝ちです。",
        "interactive": False,
        "code": (
            "(1, 6) >> Random >> player.\n"
            "(1, 6) >> Random >> robot.\n\n"
            "player > robot >> Check:\n"
            "    is true:\n"
            '        "あなたの勝ち！ {player} 対 {robot}".\n'
            "    else:\n"
            "        player == robot >> Check:\n"
            "            is true:\n"
            '                "引き分け！ どちらも {player}".\n'
            "            else:\n"
            '                "ロボット君の勝ち！ {player} 対 {robot}".\n'
            "        ..\n"
            ".. >> result.\n\n"
            "result >> Display."
        ),
    },
    {
        "id": "quiz",
        "category": "ミニゲーム",
        "title": "ミニゲーム｜一問クイズに答えよう",
        "description": "入力した答えをCheckで判定する小さなクイズです。",
        "interactive": True,
        "code": (
            '"日本の首都は？ " >> Input >> answer.\n\n'
            'answer == "東京" >> Check:\n'
            "    is true:\n"
            '        "正解です！".\n'
            "    else:\n"
            '        "残念。正解は東京です。".\n'
            ".. >> result.\n\n"
            "result >> Display."
        ),
    },
    {
        "id": "countdown",
        "category": "くり返し",
        "title": "くり返し｜カウントダウンしよう",
        "description": "Loopで5から0まで数え、Breakで安全に止めます。",
        "interactive": False,
        "code": (
            "5 >> Loop(count):\n"
            "    count >> Display.\n"
            "    count >> Check(value):\n"
            "        is value == 0:\n"
            '            "発射！" >> Break.\n'
            "        else:\n"
            "            value - 1.\n"
            "    ..\n"
            ".. >> result.\n\n"
            "result >> Display."
        ),
    },
    {
        "id": "shopping-total",
        "category": "くらし",
        "title": "くらし｜お買い物の合計を出そう",
        "description": "Reduceで商品の価格を足し合わせます。",
        "interactive": False,
        "code": (
            "[120, 250, 80, 300] >> Reduce(state):\n"
            "    state[0] + state[1].\n"
            ".. >> total.\n\n"
            '"お買い物の合計は {total} 円です。" >> Display.'
        ),
    },
    {
        "id": "string-greeting",
        "category": "文字",
        "title": "文字｜あいさつを作ろう",
        "description": "文字列の補完で、名前入りのメッセージを作ります。",
        "interactive": False,
        "code": (
            '"Mika" >> name.\n'
            '"こんにちは、{name}さん！" >> message.\n\n'
            "message >> Display."
        ),
    },
    {
        "id": "word-counter",
        "category": "文字",
        "title": "文字｜言葉の数を数えよう",
        "description": "Splitで文章を分け、Lengthで数を調べます。",
        "interactive": False,
        "code": (
            '"pop pop corn" >> text.\n'
            '(text, " ") >> Split >> words.\n'
            "words >> Length >> count.\n\n"
            '"言葉は {count} 個あります。" >> Display.'
        ),
    },
    {
        "id": "list-sum",
        "category": "リスト",
        "title": "リスト｜合計を出そう",
        "description": "Sumでリスト内の数値をまとめて足します。",
        "interactive": False,
        "code": (
            "[3, 5, 8, 13] >> numbers.\n"
            "numbers >> Sum >> total.\n\n"
            '"合計は {total} です。" >> Display.'
        ),
    },
    {
        "id": "list-append",
        "category": "リスト",
        "title": "リスト｜予定を足そう",
        "description": "Appendで新しいリストを作り、元のリストはそのままにします。",
        "interactive": False,
        "code": (
            '["朝ごはん", "散歩"] >> plan.\n'
            '(plan, "PopCornを書く") >> Append >> today.\n\n'
            "today >> Display."
        ),
    },
    {
        "id": "sort-ranking",
        "category": "リスト",
        "title": "リスト｜点数順に並べよう",
        "description": "Sortで辞書のリストを点数の高い順に並べます。",
        "interactive": False,
        "code": (
            '[{"name": "Aoi", "score": 92}, {"name": "Ren", "score": 75}, {"name": "Sora", "score": 88}] >> players.\n'
            "players >> Sort(player):\n"
            "    -player::score.\n"
            ".. >> ranking.\n\n"
            "ranking >> Display."
        ),
    },
    {
        "id": "group-colors",
        "category": "リスト",
        "title": "リスト｜色ごとに分けよう",
        "description": "Groupで同じキーを持つデータをまとめます。",
        "interactive": False,
        "code": (
            '[{"color": "red", "name": "apple"}, {"color": "yellow", "name": "banana"}, {"color": "red", "name": "strawberry"}] >> fruits.\n'
            "fruits >> Group(fruit):\n"
            "    fruit::color.\n"
            ".. >> boxes.\n\n"
            "boxes >> Display."
        ),
    },
    {
        "id": "dict-update",
        "category": "辞書",
        "title": "辞書｜プロフィールを更新しよう",
        "description": "Updateで辞書を非破壊的に更新します。",
        "interactive": False,
        "code": (
            '{"name": "PopCorn", "level": 1} >> profile.\n'
            "profile >> Update(user):\n"
            "    user::level + 1 >> user::level.\n"
            '    "PopCorn" >> user::release.\n'
            ".. >> next_profile.\n\n"
            "next_profile >> Display."
        ),
    },
    {
        "id": "fork-statistics",
        "category": "集計",
        "title": "集計｜まとめて計算しよう",
        "description": "Forkで同じリストから複数の結果を作ります。",
        "interactive": False,
        "code": (
            "[4, 8, 15, 16, 23, 42] >> scores.\n"
            "scores >> Fork(values):\n"
            "    values >> Sum.\n"
            "    values >> Max.\n"
            "    values >> Min.\n"
            ".. >> summary.\n\n"
            "summary >> Display."
        ),
    },
    {
        "id": "zip-add",
        "category": "集計",
        "title": "集計｜二つのリストを足そう",
        "description": "Zipで二つのリストを組にしてからMapで足します。",
        "interactive": False,
        "code": (
            "([1, 2, 3], [10, 20, 30]) >> Zip >> Map(pair):\n"
            "    pair[0] + pair[1].\n"
            ".. >> sums.\n\n"
            "sums >> Display."
        ),
    },
    {
        "id": "lucky-snack",
        "category": "ミニゲーム",
        "title": "ミニゲーム｜おやつルーレット",
        "description": "RandomとGetで、今日のおやつをひとつ選びます。",
        "interactive": False,
        "code": (
            '["ポップコーン", "プリン", "クッキー", "ドーナツ"] >> snacks.\n'
            "(0, 3) >> Random >> index.\n"
            "(snacks, index) >> Get >> snack.\n\n"
            '"今日のおやつは {snack} です。" >> Display.'
        ),
    },
)


def public_gallery() -> list[dict[str, Any]]:
    """Return the JSON-safe gallery shown by the Playground."""

    return [dict(example) for example in GALLERY]

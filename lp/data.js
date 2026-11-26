window.POPCORN_LP = {
  "hero": {
    "code": "[1, 2, 3, 4, 5, 6]\n    >> Filter (@ % 2 == 0)\n    >> Map (@ * 10)\n    >> Sum\n    >> total.",
    "values": [
      "[1, 2, 3, 4, 5, 6]",
      "[2, 4, 6]",
      "[20, 40, 60]",
      "120",
      "total = 120"
    ],
    "check": "total >> Display.",
    "output": "120"
  },
  "rules": [
    {
      "code": "\"popcorn\" >> Uppercase >> Display.",
      "output": "POPCORN"
    },
    {
      "code": "42 >> answer.\n\"答えは {answer} です。\" >> Display.",
      "output": "答えは 42 です。"
    },
    {
      "code": "[1, 2, 3] >> Map as x:\n    x * 2\n>> doubled.\n\ndoubled >> Display.",
      "output": "[2, 4, 6]"
    }
  ],
  "order": {
    "python": "sum(map(double, filter(is_even, nums)))",
    "pythonSetup": "def double(x):\n    return x * 2\n\ndef is_even(x):\n    return x % 2 == 0\n\nnums = [1, 2, 3, 4, 5, 6]",
    "popcorn": "nums >> Filter IsEven >> Map Double >> Sum.",
    "popcornSetup": "(n) >> pop IsEven:\n    n % 2 == 0\n\n(n) >> pop Double:\n    n * 2\n\n[1, 2, 3, 4, 5, 6] >> nums.",
    "check": "nums >> Filter IsEven >> Map Double >> Sum >> Display.",
    "output": "24"
  },
  "fizzbuzz": {
    "code": "(n) >> pop FizzBuzz:\n    n >> Check:\n        when n % 15 == 0: \"FizzBuzz\"\n        when n % 3 == 0: \"Fizz\"\n        when n % 5 == 0: \"Buzz\"\n        else: n\n\n(1, 30) >> Range >> Map FizzBuzz >> Display.",
    "output": "[1, 2, \"Fizz\", 4, \"Buzz\", \"Fizz\", 7, 8, \"Fizz\", \"Buzz\", 11, \"Fizz\", 13, 14, \"FizzBuzz\", 16, 17, \"Fizz\", 19, \"Buzz\", \"Fizz\", 22, 23, \"Fizz\", \"Buzz\", 26, \"Fizz\", 28, 29, \"FizzBuzz\"]"
  },
  "peek": {
    "parts": [
      "(1, 6)",
      "Range",
      "Filter (@ % 2 == 0)",
      "Map (@ * 10)",
      "tens."
    ],
    "lines": [
      "[>?> line 1] (Tuple) (1, 6)",
      "[>?> line 1 after Range] (List) [1, 2, 3, 4, 5, 6]",
      "[>?> line 1 after Filter] (List) [2, 4, 6]",
      "[>?> line 1 after Map] (List) [20, 40, 60]"
    ]
  },
  "fallback": {
    "code": "text >> Trim >> Num >!> 0 >> age.",
    "samples": [
      {
        "input": "17",
        "output": "17"
      },
      {
        "input": " 3.5 ",
        "output": "3.5"
      },
      {
        "input": "１７",
        "output": "17"
      },
      {
        "input": "abc",
        "output": "0",
        "error": "TypeError: Cannot cast 'abc' (Str) to Num"
      },
      {
        "input": "",
        "output": "0",
        "error": "TypeError: Cannot cast '' (Str) to Num"
      }
    ]
  },
  "fork": {
    "code": "[3, 8, 4] >> Fork(Sum, Average, Max - Min) >> (total, avg, spread).",
    "check": "\"{total} / {avg} / {spread}\" >> Display.",
    "output": "15 / 5 / 5"
  },
  "tests": {
    "file": "calc_test.pop",
    "good": "(a, b) >> pop AddTwo:\n    a + b.\n\npop TestAddTwo:\n    (1, 2) >> AddTwo >> Expect(3).\n    10 >> AddTwo(-3) >> Expect(7).",
    "bad": "(a, b) >> pop AddTwo:\n    a - b.\n\npop TestAddTwo:\n    (1, 2) >> AddTwo >> Expect(3).\n    10 >> AddTwo(-3) >> Expect(7).",
    "goodOutput": "calc_test.pop\n  ✓ TestAddTwo\n\n結果: 1 件中 1 件成功。すべて成功しました 🎉",
    "badOutput": "calc_test.pop\n  ✗ TestAddTwo（5 行目）\n      期待した値と、実際の値がちがいます。\n        期待した値: 3\n        実際の値:   -1\n\n結果: 1 件中 0 件成功、1 件失敗。直すところがあります"
  },
  "errors": {
    "base": "[72, 85, 90] >> scores.\nscores >> Average >> Round(1) >> avg.\n\"平均は {avg} 点です。\" >> Display.",
    "output": "平均は 82.3 点です。",
    "cases": [
      {
        "id": "dot",
        "label": "「.」を忘れる",
        "code": "[72, 85, 90] >> scores\nscores >> Average >> Round(1) >> avg.\n\"平均は {avg} 点です。\" >> Display.",
        "mark": [
          0,
          16,
          22
        ],
        "error": "SyntaxError: Missing '.' at the end of the statement at line 1, column 17",
        "insert": "."
      },
      {
        "id": "func",
        "label": "処理名をまちがえる",
        "code": "[72, 85, 90] >> scores.\nscores >> Avarage >> Round(1) >> avg.\n\"平均は {avg} 点です。\" >> Display.",
        "mark": [
          1,
          10,
          17
        ],
        "error": "NameError: Function 'Avarage' is not defined."
      },
      {
        "id": "var",
        "label": "名前をまちがえる",
        "code": "[72, 85, 90] >> scores.\nscore >> Average >> Round(1) >> avg.\n\"平均は {avg} 点です。\" >> Display.",
        "mark": [
          1,
          0,
          5
        ],
        "error": "NameError: Variable 'score' is not defined."
      },
      {
        "id": "string",
        "label": "「\"」を閉じ忘れる",
        "code": "[72, 85, 90] >> scores.\nscores >> Average >> Round(1) >> avg.\n\"平均は {avg} 点です。 >> Display.",
        "mark": [
          2,
          0,
          1
        ],
        "error": "SyntaxError: Unclosed string literal at line 3, column 1"
      }
    ]
  },
  "lab": {
    "source": [
      3,
      8,
      1,
      6,
      5,
      2
    ],
    "stages": [
      {
        "id": "even",
        "group": "pick",
        "code": "Filter (@ % 2 == 0)",
        "label": "偶数だけ",
        "numError": "TypeError: Filter stream requires a list"
      },
      {
        "id": "big",
        "group": "pick",
        "code": "Filter (@ > 4)",
        "label": "4 より大きい",
        "numError": "TypeError: Filter stream requires a list"
      },
      {
        "id": "double",
        "group": "change",
        "code": "Map (@ * 2)",
        "label": "2 倍",
        "numError": "TypeError: Map stream requires a list"
      },
      {
        "id": "inc",
        "group": "change",
        "code": "Map (@ + 1)",
        "label": "1 足す",
        "numError": "TypeError: Map stream requires a list"
      },
      {
        "id": "square",
        "group": "change",
        "code": "Map (@ * @)",
        "label": "2 乗",
        "numError": "TypeError: Map stream requires a list"
      },
      {
        "id": "sort",
        "group": "order",
        "code": "Sort",
        "label": "小さい順",
        "numError": "TypeError: Sort stream requires a list"
      },
      {
        "id": "desc",
        "group": "order",
        "code": "SortDesc",
        "label": "大きい順",
        "numError": "TypeError: SortDesc stream requires a list"
      },
      {
        "id": "reverse",
        "group": "order",
        "code": "Reverse",
        "label": "逆さま",
        "numError": "TypeError: Reverse requires List or Str"
      },
      {
        "id": "unique",
        "group": "order",
        "code": "Unique",
        "label": "ダブりを消す",
        "numError": "TypeError: Unique requires List"
      },
      {
        "id": "top3",
        "group": "order",
        "code": "Slice(0, 3)",
        "label": "先頭の 3 つ",
        "numError": "TypeError: Slice target must be List or Str"
      },
      {
        "id": "sum",
        "group": "fold",
        "code": "Sum",
        "label": "合計",
        "numError": "TypeError: Sum requires a List of Num values"
      },
      {
        "id": "max",
        "group": "fold",
        "code": "Max",
        "label": "いちばん大きい",
        "numError": "TypeError: Max requires a List of Num or Str values",
        "emptyError": "RuntimeError: Max requires a non-empty List"
      },
      {
        "id": "min",
        "group": "fold",
        "code": "Min",
        "label": "いちばん小さい",
        "numError": "TypeError: Min requires a List of Num or Str values",
        "emptyError": "RuntimeError: Min requires a non-empty List"
      },
      {
        "id": "length",
        "group": "fold",
        "code": "Length",
        "label": "いくつ？",
        "numError": "TypeError: Cannot get length of Num"
      },
      {
        "id": "average",
        "group": "fold",
        "code": "Average",
        "label": "平均",
        "numError": "TypeError: Average requires a List of Num values",
        "emptyError": "RuntimeError: Average requires a non-empty List"
      }
    ],
    "presets": [
      {
        "label": "偶数を 2 倍して合計",
        "stages": [
          "even",
          "double",
          "sum"
        ]
      },
      {
        "label": "大きい順に 3 つ",
        "stages": [
          "desc",
          "top3"
        ]
      },
      {
        "label": "ダブりを消して数える",
        "stages": [
          "unique",
          "length"
        ]
      },
      {
        "label": "わざとエラー",
        "stages": [
          "sum",
          "double"
        ]
      }
    ]
  },
  "examples": [
    {
      "id": "hello-pipeline",
      "label": "はじめの一歩",
      "emoji": "👋",
      "interactive": false,
      "code": "42 >> answer.\n\"答えは {answer} です。\" >> Display."
    },
    {
      "id": "fizzbuzz",
      "label": "FizzBuzz",
      "emoji": "🔢",
      "interactive": false,
      "code": "(1, 30) >> Range >> Map as number:\n    number >> Check as value:\n        when value % 15 == 0:\n            \"FizzBuzz\".\n        when value % 3 == 0:\n            \"Fizz\".\n        when value % 5 == 0:\n            \"Buzz\".\n        else:\n            value >> Str.\n>> fizzbuzz.\n\nfizzbuzz >> Display."
    },
    {
      "id": "fortune",
      "label": "今日の運勢",
      "emoji": "🔮",
      "interactive": true,
      "code": "\"あなたの名前は？ \" >> Input >> name.\n[\"大吉\", \"中吉\", \"小吉\", \"吉\", \"末吉\"] >> fortunes.\n(0, 4) >> Random >> fortune_index.\nfortunes >> Get(fortune_index) >> fortune.\n\n\"{name}さんの今日の運勢は「{fortune}」です！\" >> Display."
    },
    {
      "id": "rock-paper-scissors",
      "label": "じゃんけん",
      "emoji": "✊",
      "interactive": true,
      "code": "[\"グー\", \"チョキ\", \"パー\"] >> hands.\n\"グー、チョキ、パーのどれにする？ \" >> Input >> choice.\n(0, 2) >> Random >> robot_index.\nhands >> Get(robot_index) >> robot.\n\nchoice >> Check:\n    when @ == robot:\n        \"あいこです！ あなたもロボット君も{choice}。\".\n    else:\n        \"あなたは{choice}、ロボット君は{robot}でした！\".\n>> result.\n\nresult >> Display."
    },
    {
      "id": "lucky-snack",
      "label": "おやつルーレット",
      "emoji": "🍿",
      "interactive": false,
      "code": "[\"ポップコーン\", \"プリン\", \"クッキー\", \"ドーナツ\"] >> snacks.\n(0, 3) >> Random >> index.\nsnacks >> Get(index) >> snack.\n\n\"今日のおやつは {snack} です。\" >> Display."
    },
    {
      "id": "countdown",
      "label": "カウントダウン",
      "emoji": "🚀",
      "interactive": false,
      "code": "5 >> Loop as count:\n    count >> Display.\n    \"発射！\" >> Break when count == 0.\n    count - 1.\n>> result.\n\nresult >> Display."
    },
    {
      "id": "shopping-total",
      "label": "お買い物の合計",
      "emoji": "🛒",
      "interactive": false,
      "code": "[120, 250, 80, 300] >> Reduce(0) as (acc, price):\n    acc + price.\n>> total.\n\n\"お買い物の合計は {total} 円です。\" >> Display."
    },
    {
      "id": "write-tests",
      "label": "テストを書く",
      "emoji": "✅",
      "interactive": false,
      "code": "(price, rate) >> pop Discount:\n    price * (100 - rate) / 100 >> Round.\n\npop TestDiscount:\n    1000 >> Discount(20) >> Expect(800).\n    999 >> Discount(10) >> Expect(899).\n\npop TestNoDiscount:\n    500 >> Discount(0) >> Expect(500).\n\npop TestPriceIsNumber:\n    \"千円\" >> ExpectError(@ >> Discount(10), \"TypeError\")."
    }
  ],
  "lessons": [
    {
      "badge": "01",
      "title": "はじめての表示",
      "intro": "まずは短い文字を画面に出して、PopCornの流れを見てみよう。"
    },
    {
      "badge": "02",
      "title": "数字を2倍にしよう",
      "intro": "Mapは、リストの値を一つずつ同じルールで作り替えるよ。"
    },
    {
      "badge": "03",
      "title": "偶数だけ集めよう",
      "intro": "Filterは、条件に合う値だけを新しいリストへ集めるよ。"
    },
    {
      "badge": "04",
      "title": "合計を出そう",
      "intro": "Reduceは、これまでの結果と次の値を使って一つの答えを作るよ。"
    },
    {
      "badge": "05",
      "title": "プロフィールを更新しよう",
      "intro": "Updateは、元の辞書を変えずに新しい内容の辞書を作るよ。"
    },
    {
      "badge": "06",
      "title": "数字を分類しよう",
      "intro": "Checkは、条件を上から調べて最初に合った答えを選ぶよ。"
    },
    {
      "badge": "07",
      "title": "足し算関数を作ろう",
      "intro": "`pop`を使って、二つの数字を足す自分の関数を作ってみよう。"
    },
    {
      "badge": "08",
      "title": "5まで数えて止めよう",
      "intro": "Loopで数字を一つずつ増やし、Breakと後置whenで安全に止めてみよう。"
    }
  ],
  "bgm": {
    "src": "",
    "title": "",
    "author": "",
    "authorUrl": "",
    "license": "",
    "licenseUrl": ""
  }
};

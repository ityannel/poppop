window.POPCORN_GAMES = {
  "rhythm": {
    "lanes": [
      {
        "kind": "value",
        "key": "D",
        "label": {
          "ja": "値",
          "en": "Value"
        },
        "hint": {
          "ja": "データ",
          "en": "data"
        }
      },
      {
        "kind": "pipe",
        "key": "F",
        "label": ">>",
        "hint": {
          "ja": "つなぐ",
          "en": "connect"
        }
      },
      {
        "kind": "tool",
        "key": "J",
        "label": {
          "ja": "道具",
          "en": "Tool"
        },
        "hint": {
          "ja": "Sum など",
          "en": "like Sum"
        }
      },
      {
        "kind": "dot",
        "key": "K",
        "label": ".",
        "hint": {
          "ja": "おわり",
          "en": "end"
        }
      }
    ],
    "songs": [
      {
        "id": "sum",
        "title": {
          "ja": "はじめの一曲",
          "en": "First song"
        },
        "learn": {
          "ja": "値を >> でつないで、Sum でたして、Display で見せる。これが PopCorn の基本の形です。",
          "en": "Connect a value with >>, add it up with Sum, and show it with Display. That is the basic shape of PopCorn."
        },
        "code": "[1, 2, 3] >> Sum >> Display.",
        "output": "6",
        "chunks": [
          [
            "[1, 2, 3]",
            "value"
          ],
          [
            ">>",
            "pipe"
          ],
          [
            "Sum",
            "tool"
          ],
          [
            ">>",
            "pipe"
          ],
          [
            "Display",
            "tool"
          ],
          [
            ".",
            "dot"
          ]
        ]
      },
      {
        "id": "upper",
        "title": {
          "ja": "文字の曲",
          "en": "Text song"
        },
        "learn": {
          "ja": "文字も、同じようにつなげます。Uppercase は、大文字にする道具です。",
          "en": "Text flows the same way. Uppercase is a tool that makes letters capital."
        },
        "code": "\"popcorn\" >> Uppercase >> Display.",
        "output": "POPCORN",
        "chunks": [
          [
            "\"popcorn\"",
            "value"
          ],
          [
            ">>",
            "pipe"
          ],
          [
            "Uppercase",
            "tool"
          ],
          [
            ">>",
            "pipe"
          ],
          [
            "Display",
            "tool"
          ],
          [
            ".",
            "dot"
          ]
        ]
      },
      {
        "id": "map",
        "title": {
          "ja": "ながい一曲",
          "en": "Long song"
        },
        "learn": {
          "ja": "Map は、ならんだ値を、ぜんぶ同じように変えます。@ は「いま見ている 1 つ」。",
          "en": "Map changes every value in a list the same way. @ means the one it is looking at now."
        },
        "code": "[1, 2, 3, 4] >> Map (@ * 2) >> Sum >> Display.",
        "output": "20",
        "chunks": [
          [
            "[1, 2, 3, 4]",
            "value"
          ],
          [
            ">>",
            "pipe"
          ],
          [
            "Map (@ * 2)",
            "tool"
          ],
          [
            ">>",
            "pipe"
          ],
          [
            "Sum",
            "tool"
          ],
          [
            ">>",
            "pipe"
          ],
          [
            "Display",
            "tool"
          ],
          [
            ".",
            "dot"
          ]
        ]
      }
    ]
  },
  "quiz": [
    {
      "code": "[1, 2, 3] >> Sum >> Display.",
      "ask": {
        "ja": "出力は、どれ？",
        "en": "What does it print?"
      },
      "choices": [
        "6",
        "[1, 2, 3]",
        "3",
        {
          "ja": "エラーになる",
          "en": "It is an error"
        }
      ],
      "answer": 0,
      "explain": {
        "ja": "Sum は、並んだ数を ぜんぶたします。1 + 2 + 3 で 6。",
        "en": "Sum adds up every number in the list. 1 + 2 + 3 is 6."
      },
      "kind": "output",
      "output": "6"
    },
    {
      "code": "\"popcorn\" >> Uppercase >> Display.",
      "ask": {
        "ja": "出力は、どれ？",
        "en": "What does it print?"
      },
      "choices": [
        "POPCORN",
        "popcorn",
        "Popcorn",
        {
          "ja": "エラーになる",
          "en": "It is an error"
        }
      ],
      "answer": 0,
      "explain": {
        "ja": "Uppercase は、文字を ぜんぶ大文字にします。",
        "en": "Uppercase turns every letter into a capital."
      },
      "kind": "output",
      "output": "POPCORN"
    },
    {
      "code": "[3, 1, 2] >> Sort >> First >> Display.",
      "ask": {
        "ja": "出力は、どれ？",
        "en": "What does it print?"
      },
      "choices": [
        "3",
        "1",
        "2",
        "[1, 2, 3]"
      ],
      "answer": 1,
      "explain": {
        "ja": "Sort で 小さい順に [1, 2, 3]。First は、いちばん前の 1 つ。だから 1。",
        "en": "Sort makes [1, 2, 3]. First takes the front one, so it is 1."
      },
      "kind": "output",
      "output": "1"
    },
    {
      "code": "[1, 2, 3, 4] >> Map (@ * 2) >> Sum >> Display.",
      "ask": {
        "ja": "出力は、どれ？",
        "en": "What does it print?"
      },
      "choices": [
        "20",
        "10",
        "[2, 4, 6, 8]",
        "24"
      ],
      "answer": 0,
      "explain": {
        "ja": "Map が [2, 4, 6, 8] にして、Sum が たして 20。左から、順番に読みます。",
        "en": "Map makes [2, 4, 6, 8] and Sum adds it up to 20. Read from left to right."
      },
      "kind": "output",
      "output": "20"
    },
    {
      "code": "[1, 2, 3, 4] >> Filter (@ % 2 == 0) >> Reverse >> Display.",
      "ask": {
        "ja": "出力は、どれ？",
        "en": "What does it print?"
      },
      "choices": [
        "[2, 4]",
        "[4, 2]",
        "[1, 3]",
        "[4, 2, 1, 3]"
      ],
      "answer": 1,
      "explain": {
        "ja": "Filter が 偶数だけ [2, 4] を残して、Reverse が ひっくり返して [4, 2]。",
        "en": "Filter keeps only the even numbers [2, 4], and Reverse flips them into [4, 2]."
      },
      "kind": "output",
      "output": "[4, 2]"
    },
    {
      "code": "[1, 2, 3] >> Map (@ * 2) >?> Sum >> Display.",
      "ask": {
        "ja": ">?> は、何をする？",
        "en": "What does >?> do?"
      },
      "choices": [
        {
          "ja": "途中の値を見せて、そのまま先へ流す",
          "en": "Shows the value in the middle, then passes it on"
        },
        {
          "ja": "そこで止まる",
          "en": "Stops right there"
        },
        {
          "ja": "値を消す",
          "en": "Deletes the value"
        },
        {
          "ja": "エラーにする",
          "en": "Makes an error"
        }
      ],
      "answer": 0,
      "explain": {
        "ja": "実行すると、途中の [2, 4, 6] が見えて、そのまま Sum へ進み、12 が出ます。デバッグの味方です。",
        "en": "When it runs, you can see [2, 4, 6] in the middle, and it keeps going to Sum, which gives 12. A friend for debugging."
      },
      "kind": "concept",
      "output": "[>?> line 1 after Map] (List) [2, 4, 6]\n12"
    }
  ],
  "bugs": [
    {
      "code": "[1, 2, 3] >> Sum >> Display",
      "error": "SyntaxError: Missing '.' at the end of the statement at line 1, column 21",
      "fixed": "[1, 2, 3] >> Sum >> Display.",
      "output": "6",
      "choices": [
        {
          "ja": "いちばん最後に . をつける",
          "en": "Add . at the very end"
        },
        {
          "ja": "Sum を Total に変える",
          "en": "Change Sum to Total"
        },
        {
          "ja": "[ ] を ( ) にする",
          "en": "Change [ ] to ( )"
        }
      ],
      "answer": 0,
      "hint": {
        "ja": "PopCorn の文は、. で おわります。",
        "en": "A PopCorn statement ends with a dot."
      }
    },
    {
      "code": "[1, 2, 3] >> Sump >> Display.",
      "error": "NameError: Function 'Sump' is not defined.",
      "fixed": "[1, 2, 3] >> Sum >> Display.",
      "output": "6",
      "choices": [
        {
          "ja": "Sump を Sum に直す",
          "en": "Fix Sump to Sum"
        },
        {
          "ja": "最後の . を消す",
          "en": "Remove the last dot"
        },
        {
          "ja": "Display を Show に変える",
          "en": "Change Display to Show"
        }
      ],
      "answer": 0,
      "hint": {
        "ja": "道具の名前は、1 文字でも ちがうと、見つかりません。",
        "en": "A tool name must be exact. One wrong letter and it is not found."
      }
    },
    {
      "code": "\"popcorn >> Uppercase >> Display.",
      "error": "SyntaxError: Unclosed string literal at line 1, column 1",
      "fixed": "\"popcorn\" >> Uppercase >> Display.",
      "output": "POPCORN",
      "choices": [
        {
          "ja": "文字の終わりに \" をつける",
          "en": "Close the text with \""
        },
        {
          "ja": "Uppercase を消す",
          "en": "Remove Uppercase"
        },
        {
          "ja": ">> を > にする",
          "en": "Change >> to >"
        }
      ],
      "answer": 0,
      "hint": {
        "ja": "文字は、\" で始まって、\" で閉じます。",
        "en": "Text starts with \" and ends with \"."
      }
    },
    {
      "code": "3 >> n.\nm * 2 >> Display.",
      "error": "NameError: Variable 'm' is not defined.",
      "fixed": "3 >> n.\nn * 2 >> Display.",
      "output": "6",
      "choices": [
        {
          "ja": "m を n に直す",
          "en": "Fix m to n"
        },
        {
          "ja": "最初の 3 を消す",
          "en": "Remove the first 3"
        },
        {
          "ja": "Display を Print に変える",
          "en": "Change Display to Print"
        }
      ],
      "answer": 0,
      "hint": {
        "ja": "名前は、先に作った名前だけ使えます。",
        "en": "You can only use names you made earlier."
      }
    }
  ],
  "puzzles": [
    {
      "output": "6",
      "chips": [
        "[1, 2, 3]",
        ">> Sum",
        ">> Display."
      ],
      "join": " ",
      "accept": [
        "[1, 2, 3] >> Sum >> Display."
      ],
      "hint": null
    },
    {
      "output": "[4, 2]",
      "chips": [
        "[1, 2, 3, 4]",
        ">> Filter (@ % 2 == 0)",
        ">> Reverse",
        ">> Display."
      ],
      "join": " ",
      "accept": [
        "[1, 2, 3, 4] >> Filter (@ % 2 == 0) >> Reverse >> Display.",
        "[1, 2, 3, 4] >> Reverse >> Filter (@ % 2 == 0) >> Display."
      ],
      "hint": {
        "ja": "2 とおり、できます。",
        "en": "There are two ways."
      }
    },
    {
      "output": "12",
      "chips": [
        "n * 4 >> Display.",
        "3 >> n.",
        "n >> Display."
      ],
      "join": "\n",
      "accept": [
        "3 >> n.\nn * 4 >> Display."
      ],
      "hint": {
        "ja": "つかわないカードが 1 まい、まざっています。",
        "en": "One card is not needed."
      }
    },
    {
      "output": "82.3",
      "chips": [
        "[72, 85, 90]",
        ">> Average",
        ">> Round(1)",
        ">> Display."
      ],
      "join": " ",
      "accept": [
        "[72, 85, 90] >> Average >> Round(1) >> Display."
      ],
      "hint": null
    }
  ]
};

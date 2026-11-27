window.POPCORN_GAMES = {
  "rhythm": {
    "lanes": [
      {
        "kind": "value",
        "key": "D",
        "label": {
          "ja": "値",
          "en": "Value"
        }
      },
      {
        "kind": "pipe",
        "key": "F",
        "label": ">>"
      },
      {
        "kind": "tool",
        "key": "J",
        "label": {
          "ja": "道具",
          "en": "Tool"
        }
      },
      {
        "kind": "dot",
        "key": "K",
        "label": "."
      }
    ],
    "songs": [
      {
        "id": "sum",
        "title": {
          "ja": "はじめの一曲",
          "en": "First song"
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
      "kind": "output",
      "output": "6"
    },
    {
      "code": "\"popcorn\" >> Uppercase >> Display.",
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
      "kind": "output",
      "output": "POPCORN"
    },
    {
      "code": "[3, 1, 2] >> Sort >> First >> Display.",
      "choices": [
        "3",
        "1",
        "2",
        "[1, 2, 3]"
      ],
      "answer": 1,
      "kind": "output",
      "output": "1"
    },
    {
      "code": "[1, 2, 3, 4] >> Map (@ * 2) >> Sum >> Display.",
      "choices": [
        "20",
        "10",
        "[2, 4, 6, 8]",
        "24"
      ],
      "answer": 0,
      "kind": "output",
      "output": "20"
    },
    {
      "code": "[1, 2, 3, 4] >> Filter (@ % 2 == 0) >> Reverse >> Display.",
      "choices": [
        "[2, 4]",
        "[4, 2]",
        "[1, 3]",
        "[4, 2, 1, 3]"
      ],
      "answer": 1,
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
        "ja": "途中の [2, 4, 6] が見えて、そのまま Sum へ進む",
        "en": "You see [2, 4, 6] on the way, and it keeps going to Sum"
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
      "answer": 0
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
      "answer": 0
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
      "answer": 0
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
      "answer": 0
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
      ]
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
      ]
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
      ]
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
      ]
    }
  ]
};
